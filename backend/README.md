# Step 1: Python browser API

Run these commands from the project root (Python 3.11 matches the existing dependencies):

```sh
python3.11 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/tests/requirements.txt
backend/.venv/bin/python -m uvicorn backend.app:app --reload --ws-max-size 2900000 --ws-max-queue 1
backend/.venv/bin/python -m unittest discover -s backend/tests -v
```

Health check: `http://localhost:8000/health`. WebSocket: `ws://localhost:8000/ws/detect`.

## Dependency environments

- `requirements-base.txt`: shared dependencies.
- `requirements.txt`: server dependencies, including headless OpenCV. Render's
  build command is `pip install -r backend/requirements.txt` from the repo root.
- `requirements-desktop.txt`: desktop dependencies, including GUI-enabled OpenCV.
- `tests/requirements.txt`: includes server dependencies and test tools.

Use separate environments: both OpenCV packages provide `cv2` and must not be
installed together. The existing root `venv/` can still run the desktop app;
create a fresh server environment rather than installing headless OpenCV into it.

To create a separate desktop environment, run from the repo root:

```sh
python3.11 -m venv backend/.venv-desktop
backend/.venv-desktop/bin/pip install -r backend/requirements-desktop.txt
backend/.venv-desktop/bin/python -m backend.desktop
```

## Protocol

The server first sends `{ "type": "ready", "settings": { ... } }` with defaults.
Send a JSON message with `type: "frame"`, a nonnegative integer `frame_id`,
`image` (base64 JPEG without a data URL prefix), and optional `settings`.
Images must be no larger than 1280 × 720 and 2 MB compressed.

Settings contain `color` (hex label), `lower_hsv`, `upper_hsv`, `min_area`, and
`tracking`. HSV arrays have three integers: hue 0–179, saturation/value 0–255.
Lower hue greater than upper hue wraps through zero for red. Saturation/value
minimums must not exceed maximums. Settings are complete per-frame snapshots;
omitted fields use defaults. The frontend will compute HSV limits when choosing
a color: the `color` field alone is metadata and does not change the thresholds.

The server responds with:

```json
{
  "type": "result",
  "frame_id": 0,
  "width": 640,
  "height": 480,
  "processing_ms": 5.4,
  "boxes": [
    {"track_id": 1, "x": 100, "y": 80, "width": 50, "height": 60, "color": "#ffff00"}
  ]
}
```

Boxes use coordinates of the submitted image, not CSS display coordinates.
Tracking IDs are connection-local; untracked boxes have a null ID. New settings
reset tracking to avoid retaining boxes from a previous target. Frame-size
changes also reset tracking so old coordinates are not reused. Tracked boxes
require two detections initially and persist through two missed frames. Web
smoothing is 0.7 for faster movement; desktop tracker defaults are preserved.

**Flow control:** the client must wait for `result` or `error` before capturing
and sending its next frame. Do not enqueue frames or use an unconditional send
interval. The backend processes messages sequentially and offloads OpenCV work
from the async event loop. The Uvicorn queue limit bounds transport buffering;
the frontend send-and-wait loop is what ensures one frame in flight.

Invalid input returns `{ "type": "error", "message": "...", "detail": "..." }`.
An oversized message closes the connection. Unexpected failures close with code
1011; disconnecting discards that visitor's detector/tracker state. Handshake
failures are handled too, and cleanup tolerates connections that close before
or during the close operation without masking the original processing error. Frames are
processed in memory and are not written to disk.

Browser origins default to `http://localhost:3000` and `http://127.0.0.1:3000`.
Set comma-separated `ALLOWED_ORIGINS` when deploying. Use HTTPS/WSS in production.
Origin checks do not authenticate non-browser API clients.

## Structure and next stages

- `backend/desktop.py`: desktop webcam entry point, preserved.
- `backend/detector.py`, `backend/tracker.py`, `backend/util.py`: shared processing.
- `backend/regions.py`: groups nearby mask fragments using original measured contour area.
  The web detector enables a six-pixel grouping gap; desktop defaults are retained.
- `backend/models.py`: validated frame and settings messages.
- `backend/session.py`: decoding and visitor-specific processing state.
- `backend/app.py`: health endpoint and WebSocket lifecycle.
- `backend/tests/test_backend.py`: synthetic JPEG/WebSocket integration checks.
- `frontend/` (Steps 2–3): Next.js camera interface, send-and-wait JPEG streaming,
  and responsive detection overlays. See `../frontend/README.md` to run both services.

Step 3 connects detection overlays. Step 4 adds live controls over the existing
per-frame settings protocol, and Step 5
covers UI, errors, and performance. Camera frames are sent to this Python service;
the frontend explains this before camera use. No processed video is returned.
