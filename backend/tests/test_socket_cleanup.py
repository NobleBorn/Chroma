import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import WebSocketDisconnect
from starlette.websockets import WebSocketState

from backend.app import close_safely, detect


def socket():
    return SimpleNamespace(
        headers={},
        application_state=WebSocketState.CONNECTED,
        client_state=WebSocketState.CONNECTED,
        accept=AsyncMock(),
        send_json=AsyncMock(),
        receive_text=AsyncMock(return_value='{"type":"frame","frame_id":0,"image":""}'),
        close=AsyncMock(),
    )


class SocketCleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_already_closed_sockets_are_not_closed_again(self):
        for state in ('application_state', 'client_state'):
            ws = socket()
            setattr(ws, state, WebSocketState.DISCONNECTED)
            await close_safely(ws, 1011)
            ws.close.assert_not_awaited()

    async def test_disconnect_race_during_close_does_not_escape(self):
        for error in (RuntimeError('already closed'), OSError('transport closed'),
                      WebSocketDisconnect(1001)):
            ws = socket()
            ws.close.side_effect = error
            await close_safely(ws, 1011, 'Detection failed')
            ws.close.assert_awaited_once_with(code=1011, reason='Detection failed')

    async def test_disconnect_during_initial_handshake_is_handled(self):
        ws = socket()
        ws.send_json.side_effect = WebSocketDisconnect(1001)
        await detect(ws)
        ws.receive_text.assert_not_awaited()
        ws.close.assert_not_awaited()

    async def test_processing_failure_preserves_original_log_when_close_fails(self):
        ws = socket()
        ws.close.side_effect = RuntimeError('already closed')
        with patch('backend.app.run_in_threadpool', side_effect=RuntimeError('processing failed')):
            with patch('backend.app.logger.exception') as log:
                await detect(ws)
                log.assert_called_once_with('Detection connection failed')
        ws.close.assert_awaited_once_with(code=1011, reason='Detection failed')

    async def test_session_initialization_failure_is_also_cleaned_up(self):
        ws = socket()
        with patch('backend.app.DetectionSession', side_effect=ValueError('initialization failed')):
            with patch('backend.app.logger.exception'):
                await detect(ws)
        ws.close.assert_awaited_once_with(code=1011, reason='Detection failed')


if __name__ == '__main__':
    unittest.main()
