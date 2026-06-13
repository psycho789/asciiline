import logging
import os
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, FastAPI, Query, WebSocket
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles

from adapters.fastapi_ws_adapter import FastApiConnection
from adapters.ffmpeg_audio import stream_audio_for_session
from adapters.paths import BASE_DIR
from ascii_video_player2 import VideoDecoder
from use_cases.broadcast_hub import BroadcastHub
from use_cases.stream_prefs import parse_stream_prefs
from use_cases.stream_session import SessionRegistry, StreamSession
from use_cases.streaming_provider import HubStreamingProvider

logger = logging.getLogger(__name__)


def get_html_content() -> str:
    html_path = os.path.join(BASE_DIR, "index.html")
    with open(html_path, encoding="utf-8") as f:
        return f.read()


def create_app(
    queue: list[dict],
    loop_flag: bool,
    decoder_factory: Callable[..., VideoDecoder] = VideoDecoder,
    *,
    debug: bool = False,
    session_registry: SessionRegistry | None = None,
) -> FastAPI:
    app = FastAPI()
    app.state.debug = debug
    hub = BroadcastHub(decoder_factory=decoder_factory)
    registry = session_registry or SessionRegistry()

    def get_hub() -> BroadcastHub:
        return hub

    def get_registry() -> SessionRegistry:
        return registry

    def get_queue() -> list[dict]:
        return queue

    HubDep = Annotated[BroadcastHub, Depends(get_hub)]
    RegistryDep = Annotated[SessionRegistry, Depends(get_registry)]
    QueueDep = Annotated[list[dict], Depends(get_queue)]

    app.state.session_registry = registry

    app.mount("/static", StaticFiles(directory=BASE_DIR), name="static")

    if debug:

        @app.middleware("http")
        async def disable_static_cache(request, call_next):
            response = await call_next(request)
            if request.url.path.startswith("/static/"):
                response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
                response.headers["Pragma"] = "no-cache"
            return response

    @app.get("/")
    async def root() -> HTMLResponse:
        return HTMLResponse(get_html_content())

    @app.get("/metrics")
    async def metrics_endpoint(hub: HubDep) -> dict:
        return {
            "connected_clients": hub.subscriber_count(),
            "active_streams": hub.active_stream_count(),
            "encode_fps": round(hub.last_encode_fps(), 2),
            "bytes_per_frame": round(hub.last_bytes_per_frame()),
        }

    @app.get("/audio")
    async def audio_stream(
        registry: RegistryDep,
        queue: QueueDep,
        session: str = Query(...),
    ) -> Response:
        return await stream_audio_for_session(session, queue, registry)

    @app.websocket("/ws")
    async def websocket_endpoint(
        websocket: WebSocket,
        hub: HubDep,
        registry: RegistryDep,
        queue: QueueDep,
        cols: int | None = Query(None, ge=80, le=800),
        aspect: str = Query("auto"),
    ) -> None:
        max_connections = int(os.getenv("MAX_WS_CONNECTIONS", "100"))
        if hub.subscriber_count() >= max_connections:
            await websocket.close(code=1013)
            return
        await websocket.accept()
        stream_prefs = parse_stream_prefs(cols, aspect)
        conn = FastApiConnection(websocket)
        provider = HubStreamingProvider(hub)
        session = StreamSession(provider=provider, session_registry=registry)
        try:
            await session.run(conn, queue, loop_flag, stream_prefs=stream_prefs)
        finally:
            registry.unregister(session.session_id)
            try:
                await conn.close()
            except RuntimeError:
                pass

    return app
