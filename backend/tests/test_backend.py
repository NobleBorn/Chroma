import base64
import unittest

import cv2
import numpy as np
from fastapi.testclient import TestClient

from backend.app import app
from backend.detector import ColorDetector
from backend.tracker import BoxTracker


def request(frame_id=0, settings=None, color=(0, 255, 255)):
    frame = np.zeros((120, 160, 3), dtype=np.uint8)
    frame[30:90, 40:100] = color
    success, encoded = cv2.imencode('.jpg', frame)
    assert success
    return {'type': 'frame', 'frame_id': frame_id,
            'image': base64.b64encode(encoded).decode(), 'settings': settings or {}}


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health(self):
        self.assertEqual(self.client.get('/health').json(), {'status': 'ok'})

    def test_tracking_and_visitor_isolation(self):
        with self.client.websocket_connect('/ws/detect') as first:
            self.assertEqual(first.receive_json()['type'], 'ready')
            for index in range(3):
                first.send_json(request(index))
                result = first.receive_json()
                self.assertEqual(result['frame_id'], index)
                self.assertEqual(len(result['boxes']), int(index >= 1))
            self.assertEqual(result['boxes'][0]['track_id'], 1)
            with self.client.websocket_connect('/ws/detect') as second:
                second.receive_json()
                second.send_json(request())
                self.assertEqual(second.receive_json()['boxes'], [])
            first.send_json(request(3))
            self.assertEqual(first.receive_json()['boxes'][0]['track_id'], 1)

    def test_live_settings_and_recovery(self):
        with self.client.websocket_connect('/ws/detect') as ws:
            ws.receive_json()
            ws.send_text('not json')
            self.assertEqual(ws.receive_json()['type'], 'error')
            bad = request()
            bad['image'] = 'invalid'
            ws.send_json(bad)
            self.assertEqual(ws.receive_json()['type'], 'error')
            ws.send_json(request(settings={'tracking': False}))
            result = ws.receive_json()
            self.assertEqual(len(result['boxes']), 1)
            self.assertIsNone(result['boxes'][0]['track_id'])
            ws.send_json(request(settings={'tracking': False, 'min_area': 10000}))
            self.assertEqual(ws.receive_json()['boxes'], [])
            red = {'tracking': False, 'color': '#ff0000',
                   'lower_hsv': [170, 100, 100], 'upper_hsv': [10, 255, 255]}
            ws.send_json(request(settings=red, color=(0, 0, 255)))
            self.assertEqual(ws.receive_json()['boxes'][0]['color'], '#ff0000')
            red['lower_hsv'] = [170, 255, 100]
            red['upper_hsv'] = [10, 100, 255]
            ws.send_json(request(settings=red))
            self.assertEqual(ws.receive_json()['type'], 'error')

    def test_dimensions(self):
        frame = np.zeros((721, 100, 3), dtype=np.uint8)
        _, encoded = cv2.imencode('.jpg', frame)
        message = request()
        message['image'] = base64.b64encode(encoded).decode()
        with self.client.websocket_connect('/ws/detect') as ws:
            ws.receive_json()
            ws.send_json(message)
            self.assertEqual(ws.receive_json()['type'], 'error')

    def test_warm_yellow_remains_detectable(self):
        # The distant lemon's sampled hue is 18–19, with ample saturation/value.
        color = cv2.cvtColor(np.uint8([[[18, 127, 154]]]), cv2.COLOR_HSV2BGR)[0, 0]
        with self.client.websocket_connect('/ws/detect') as ws:
            ws.receive_json()
            for index in range(3):
                ws.send_json(request(index, color=tuple(int(c) for c in color)))
                result = ws.receive_json()
            self.assertEqual(len(result['boxes']), 1)
            self.assertEqual(result['boxes'][0]['color'], '#ffff00')

    def test_small_yellow_noise_still_filtered(self):
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        frame[30:40, 40:50] = (0, 255, 255)
        _, encoded = cv2.imencode('.jpg', frame)
        message = request(settings={'tracking': False})
        message['image'] = base64.b64encode(encoded).decode()
        with self.client.websocket_connect('/ws/detect') as ws:
            ws.receive_json()
            ws.send_json(message)
            self.assertEqual(ws.receive_json()['boxes'], [])

    def test_desktop_compatibility(self):
        detector = ColorDetector([0, 255, 255])
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        frame[30:90, 40:100] = (0, 255, 255)
        _, boxes = detector.detect(frame)
        self.assertEqual(BoxTracker(min_hits=1).update(boxes), [(40, 30, 60, 60)])
        import backend.desktop  # Import must not open a webcam.

    def test_resolution_change_resets_tracking(self):
        with self.client.websocket_connect('/ws/detect') as ws:
            ws.receive_json()
            for index in range(3):
                ws.send_json(request(index))
                result = ws.receive_json()
            self.assertEqual(len(result['boxes']), 1)
            frame = np.zeros((240, 320, 3), dtype=np.uint8)
            frame[60:180, 80:200] = (0, 255, 255)
            _, encoded = cv2.imencode('.jpg', frame)
            message = request(3)
            message['image'] = base64.b64encode(encoded).decode()
            ws.send_json(message)
            result = ws.receive_json()
            self.assertEqual((result['width'], result['height']), (320, 240))
            self.assertEqual(result['boxes'], [])

    def test_web_tracking_responds_quickly_and_expires_missing_objects(self):
        with self.client.websocket_connect('/ws/detect') as ws:
            ws.receive_json()
            for index in range(2):
                ws.send_json(request(index))
                result = ws.receive_json()
                self.assertEqual(len(result['boxes']), index)
            frame = np.zeros((120, 160, 3), dtype=np.uint8)
            frame[30:90, 60:120] = (0, 255, 255)
            _, encoded = cv2.imencode('.jpg', frame)
            message = request(2)
            message['image'] = base64.b64encode(encoded).decode()
            ws.send_json(message)
            moved = ws.receive_json()['boxes'][0]
            self.assertEqual(moved['track_id'], 1)
            self.assertAlmostEqual(moved['x'], 54, delta=1)
            _, encoded = cv2.imencode('.jpg', np.zeros_like(frame))
            message['image'] = base64.b64encode(encoded).decode()
            for missed in range(3):
                message['frame_id'] = 3 + missed
                ws.send_json(message)
                self.assertEqual(len(ws.receive_json()['boxes']), int(missed < 2))


if __name__ == '__main__':
    unittest.main()
