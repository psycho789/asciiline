import logging
import os
from collections.abc import Callable

from fastapi import FastAPI, Query, WebSocket
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles

from adapters.ffmpeg_audio import stream_audio_for_session
from adapters.paths import BASE_DIR
from ascii_video_player2 import VideoDecoder
from use_cases.broadcast_hub import BroadcastHub
from use_cases.stream_session import SessionRegistry, StreamSession

logger = logging.getLogger(__name__)


def get_html_content() -> str:
    html_path = os.path.join(BASE_DIR, "index.html")
    with open(html_path, encoding="utf-8") as f:
        return f.read()


def create_app(
    queue: list[dict],
    loop_flag: bool,
    decoder_factory: Callable[..., VideoDecoder] = VideoDecoder,
) -> FastAPI:
    app = FastAPI()
    registry = SessionRegistry()
    hub = BroadcastHub(decoder_factory=decoder_factory)

    app.state.queue = queue
    app.state.loop = loop_flag
    app.state.session_registry = registry
    app.state.decoder_factory = decoder_factory
    app.state.hub = hub

    app.mount("/static", StaticFiles(directory=BASE_DIR), name="static")

    @app.get("/")
    async def root() -> HTMLResponse:
        return HTMLResponse(get_html_content())

    @app.get("/audio")
    async def audio_stream(session: str = Query(...)) -> Response:
        return stream_audio_for_session(
            session,
            app.state.queue,
            app.state.session_registry,
        )

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket) -> None:
        await websocket.accept()
        session = StreamSession(
            session_registry=app.state.session_registry,
            hub=app.state.hub,
            decoder_factory=app.state.decoder_factory,
        )
        try:
            await session.run(websocket, app.state.queue, app.state.loop)
        finally:
            app.state.session_registry.unregister(session.session_id)
            await websocket.close()

    return app
