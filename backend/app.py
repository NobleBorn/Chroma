import logging
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.websockets import WebSocketState

from backend.models import FrameRequest, Settings
from backend.session import DetectionSession

app = FastAPI(title="Color Detection API")
logger = logging.getLogger(__name__)
ALLOWED_ORIGINS = set(os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(","))


async def close_safely(websocket: WebSocket, code: int, reason: str = ""):
    """A disconnect can race any state check or outgoing ASGI message."""
    if (websocket.application_state == WebSocketState.DISCONNECTED
            or websocket.client_state == WebSocketState.DISCONNECTED):
        return
    try:
        await websocket.close(code=code, reason=reason)
    except (WebSocketDisconnect, RuntimeError, OSError):
        logger.debug("WebSocket already closed during cleanup", exc_info=True)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.websocket("/ws/detect")
async def detect(websocket: WebSocket):
    origin = websocket.headers.get("origin")
    if origin is not None and origin not in ALLOWED_ORIGINS:
        await close_safely(websocket, code=1008)
        return
    try:
        await websocket.accept()
        session = DetectionSession()
        await websocket.send_json({"type": "ready", "settings": Settings().model_dump()})
        while True:
            message = await websocket.receive_text()
            if len(message) > 2_900_000:
                await close_safely(websocket, code=1009, reason="Frame message too large")
                return
            try:
                request = FrameRequest.model_validate_json(message)
                result = await run_in_threadpool(session.process, request)
            except (ValidationError, ValueError) as error:
                await websocket.send_json({
                    "type": "error", "message": "Invalid frame or settings.",
                    "detail": str(error)[:500],
                })
                continue
            await websocket.send_json(result)
    except (WebSocketDisconnect, OSError):
        pass
    except Exception:
        logger.exception("Detection connection failed")
        await close_safely(websocket, code=1011, reason="Detection failed")
