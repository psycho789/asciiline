from __future__ import annotations

from fastapi import WebSocket
from fastapi.websockets import WebSocketDisconnect
from starlette.websockets import WebSocketState
from websockets.exceptions import ConnectionClosed

from ports.connection import ConnectionClosedError


class FastApiConnection:
    def __init__(self, ws: WebSocket) -> None:
        self._ws = ws

    async def send_text(self, text: str) -> None:
        try:
            await self._ws.send_text(text)
        except (WebSocketDisconnect, ConnectionClosed, RuntimeError) as exc:
            raise ConnectionClosedError() from exc

    async def send_bytes(self, data: bytes) -> None:
        try:
            await self._ws.send_bytes(data)
        except (WebSocketDisconnect, ConnectionClosed, RuntimeError) as exc:
            raise ConnectionClosedError() from exc

    async def close(self) -> None:
        try:
            await self._ws.close()
        except (RuntimeError, ConnectionClosed):
            pass

    @property
    def closed(self) -> bool:
        return self._ws.client_state == WebSocketState.DISCONNECTED
