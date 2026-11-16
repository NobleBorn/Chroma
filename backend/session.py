import base64
import binascii
from io import BytesIO
from time import perf_counter

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

from backend.models import FrameRequest
from backend.detector import ColorDetector
from backend.tracker import BoxTracker


class DetectionSession:
    """One visitor's detector and tracker; no shared mutable processing state."""

    def __init__(self):
        self.detector = ColorDetector([0, 255, 255], fragment_gap=6)
        self.tracker = self._new_tracker()
        self.settings = None
        self.frame_size = None

    @staticmethod
    def _new_tracker():
        # Faster web feedback; retain the desktop tracker's default behavior.
        return BoxTracker(smoothing=0.7, min_hits=2, max_missed=2,
                          handle_scale_changes=True)

    def process(self, request: FrameRequest):
        started = perf_counter()
        try:
            encoded = base64.b64decode(request.image, validate=True)
            if len(encoded) > 2_000_000:
                raise ValueError("Compressed frame exceeds 2 MB.")
            with Image.open(BytesIO(encoded)) as image:
                if image.format != "JPEG":
                    raise ValueError("Frames must be JPEG images.")
                width, height = image.size
                if not (1 <= width <= 1280 and 1 <= height <= 720):
                    raise ValueError("Frame dimensions must be at most 1280 by 720.")
                image.verify()
            frame = cv2.imdecode(np.frombuffer(encoded, np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                raise ValueError("Could not decode the frame.")
        except (binascii.Error, UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
            raise ValueError("Invalid JPEG frame.") from error

        settings = request.settings
        if settings != self.settings or self.frame_size != (width, height):
            self.tracker = self._new_tracker()
            self.settings = settings
            self.frame_size = (width, height)
            self.detector.set_hsv_limits(settings.lower_hsv, settings.upper_hsv)
            self.detector.min_area = settings.min_area
        _, boxes = self.detector.detect(frame)
        tracked = self.tracker.update_with_ids(boxes) if settings.tracking else [
            (None, box) for box in boxes
        ]
        elapsed = (perf_counter() - started) * 1000
        return {
            "type": "result", "frame_id": request.frame_id,
            "width": width, "height": height,
            "processing_ms": round(elapsed, 2),
            "boxes": [
                {"track_id": track_id, "x": x, "y": y, "width": w,
                 "height": h, "color": settings.color}
                for track_id, (x, y, w, h) in tracked
            ],
        }
