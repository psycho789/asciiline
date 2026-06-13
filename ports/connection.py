from __future__ import annotations

from typing import Protocol


class ConnectionClosedError(Exception):
    """Raised by Connection implementations when the remote disconnects.

    Use-case layer catches only this — no FastAPI or websockets types cross the boundary.
    """


class Connection(Protocol):
    async def send_text(self, text: str) -> None: ...

    async def send_bytes(self, data: bytes) -> None: ...

    async def close(self) -> None: ...

    @property
    def closed(self) -> bool: ...
