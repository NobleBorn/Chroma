# Chroma web interface — Step 4

Next.js App Router, TypeScript, and Tailwind CSS. The dark dashboard takes
inspiration from the supplied dashboard design, connects browser frames to the existing Python
detector/tracker, and supports live color and HSV tuning.

## Run both services

Requires Python 3.11 and Node.js 20.9 or newer (developed with Node 24).
From the project root, start the backend in one terminal:

```sh
venv/bin/pip install -r backend/requirements.txt
venv/bin/python -m uvicorn backend.app:app --reload --ws-max-size 2900000 --ws-max-queue 1
```

Start the frontend in a second terminal:

```sh
cd frontend
npm ci
npm run dev
```

Visit **http://127.0.0.1:3000**, click **Start camera**, and grant permission.
Hold a yellow object in view. A confirmed detection needs two consecutive
frames; small regions under 700 pixels in the submitted image are ignored.

If either port is occupied, use explicit ports and update both ends:

- `frontend/.env.local`: set `NEXT_PUBLIC_DETECTION_WS_URL` to the full WebSocket
  address, e.g. `ws://127.0.0.1:8000/ws/detect`. `.env.example` provides a template.
  The default uses the page's hostname with port 8000 and `/ws/detect`.
- Backend: set comma-separated `ALLOWED_ORIGINS` to include the frontend's exact
  origin, including port. Defaults allow localhost and 127.0.0.1 on port 3000.
- Restart Next.js after changing its environment. Public variables are embedded
  at build time, so production builds must use the final backend address.

Use HTTPS and a `wss://` endpoint when deployed. This step does not deploy the app.
The WebSocket address is public configuration and must not contain secrets.

## Working behavior

- Camera access only after an explicit click; no microphone requested.
- JPEG frames go to Python; JSON boxes return to an HTML canvas overlay.
- One frame in flight, maximum 30 submitted frames per second, JPEG quality 0.8.
- Frames are proportionally downscaled to fit 960 × 540, with no upscaling.
- Separate server-side settings and tracker state per visitor.
- Nearby mask fragments (up to a six-pixel gap) are grouped before area filtering.
  Measurements use the original contour areas, so gap pixels do not count.
- Scale-aware matching keeps a shrinking object on the same track where possible,
  and superseded overlapping missed tracks are removed to reduce duplicate boxes.
- Color and tracking-ID labels; correct mirror mode and letterbox alignment.
- Show/hide boxes without interrupting detection.
- Real detection count, completed-frame FPS, and server processing time.
- Connection status, ten-second timeouts, and manual retry without restarting
  the camera. Errors clear old boxes and metrics; the preview remains usable.
- Stop/navigation cancels further uploads and releases the camera/socket.
- A five-second camera watchdog detects missing initial frames and frozen feeds,
  releases hardware, clears detection, and offers camera retry. It monitors frame
  delivery/decoding rather than image content, so motionless scenes stay healthy.
  Hidden tabs are exempt, with a fresh grace period when visible again.

Camera frames are sent to the Python server, processed in memory, and not saved.
A privacy notice explains this before camera use. Live controls become available when the camera and detection connection are active.
The initial target is yellow.

The default yellow hue interval is 18–40 (OpenCV units). The lower limit includes
warmer yellow under webcam lighting; saturation/value minimums remain 100 and
the minimum contour area remains 700 pixels to keep background noise filtered.

Processing FPS measures completed replies per elapsed second (including capture,
encoding, network round trips, and frame pacing), rather than the inverse of
server processing time. The video shows browser-measured frame round-trip time: capture/encoding,
network, and server processing, before rendering. This does not include the
camera sensor's own latency or tracker smoothing. FPS
appears after the first sample window; unavailable metrics show a dash.

## Live color controls

- Click the color swatch to open the browser's native color picker.
- Choose Red, Green, Blue, Yellow, Orange, or Purple presets.
- Choosing a color automatically calculates HSV thresholds. Area and tracking
  preferences are preserved. You can then fine-tune all six HSV bounds.
- Hue uses OpenCV's 0–179 scale; saturation/value use 0–255. A hue minimum above
  its maximum wraps through zero, which is necessary for red. The UI explains
  this when the range wraps. Saturation/value bounds cannot cross each other.
- White/gray/black picker values use saturation/value ranges that include those
  colors rather than requiring saturated, bright pixels.
- Minimum object area is adjustable from 50 to 20,000 submitted-image pixels.
- Disable tracking for immediate raw detections; labels then omit tracking IDs.
- Reset restores yellow, HSV [18,100,100]–[40,255,255], area 700, and tracking on.

Settings travel on the next frame over the same WebSocket; the camera is not
restarted. A frame already being processed uses its original settings snapshot.
Replies for old settings are discarded, preventing previous-target boxes from
reappearing after a change. The backend resets tracking when settings change,
so confirmed boxes need two new frames to appear after tuning. Web tracking
uses smoothing 0.7 and retains boxes for up to two missed frames, balancing
stability with faster response. Desktop tracking keeps its original defaults.

Settings survive stopping/restarting the camera within the page, and reset on a
full page reload. Controls disable while the camera or connection is unavailable.

## Checks

```sh
# From frontend/
npm test
npm run build
npm run typecheck

# From the project root
venv/bin/python -m unittest discover -s backend/tests -v
```

Frontend tests cover message validation, letterbox/mirror mapping, send-and-wait
flow control, cancellation during encoding, invalid responses, timeouts, color
conversion, preset ranges, slider ordering, reset, and settings changes in flight.
Backend tests cover real JPEG processing, connection isolation, live settings,
frame-size changes, and the desktop interface.

### Manual end-to-end check

1. Open the page: no camera request or detection connection should start yet.
2. Start the camera: status should progress to **Detection connected**.
3. Hold a yellow object in view: a labeled box and detection count should appear.
   The FPS metric should update after roughly one second.
4. Toggle **Mirror preview**: boxes should follow objects and labels stay readable.
5. Resize the browser, including mobile widths: boxes must stay aligned with the
   video content rather than the surrounding black bars.
6. Toggle **Show boxes**: the overlay hides, while count/FPS continue updating.
7. Stop the Python backend: boxes/metrics clear and **Retry detection** appears.
   Restart the backend and retry; detection should resume with fresh tracking.
8. Stop the camera: footage, boxes, metrics, and uploads should stop. Start it
   again to confirm a fresh connection.
9. Select each preset while holding up a matching object. Check that the swatch,
   hex code, box label, and thresholds update without a new camera prompt.
10. Choose a custom color, then adjust each HSV bound. Verify the resulting
    detection changes. Select Red and check that its hue range wraps through zero.
11. Increase minimum area to hide a small region, then lower it to recover it.
    Disable tracking and verify labels omit IDs; enable it to re-confirm tracks.
12. Reset to defaults and verify all settings return to yellow detection.
13. Deny permission, disconnect the camera, or cancel a pending permission request:
   existing camera error handling and cleanup should continue to work.

Fast movement can still show some network/tracker lag. The browser displays its
live camera footage while boxes describe the most recently processed frame.
It intentionally drops capture opportunities while waiting rather than queuing
old frames. Steady lighting and a clearly yellow object give the best results. Grouping is
conservative but cannot distinguish separate same-colored objects that are very
close together. Wider mask gaps may still produce separate boxes.

## Modules

- `src/hooks/use-camera.ts`: camera state, permission errors, and hardware cleanup.
- `src/lib/camera-feed-monitor.ts`: frame-progress watchdog and lifecycle cleanup.
- `src/hooks/use-detection.ts`: connection state, results, and manual retry.
- `src/lib/detection-stream.ts`: capture, compression, WebSocket lifecycle/pacing.
- `src/lib/detection-protocol.ts`: typed messages, validation, and endpoint config.
- `src/lib/overlay.ts`: coordinate mapping and color-label helpers.
- `src/lib/color-settings.ts`: RGB-to-HSV conversion, presets, bounds, and defaults.
- `src/components/detection-overlay.tsx`: responsive canvas drawing.
- `src/components/camera-panel.tsx`: video, overlay, privacy, and camera actions.
- `src/components/dashboard.tsx`: connection status and live statistics.
- `src/components/detection-controls.tsx`: live picker, presets, tracking, area/reset.
- `src/components/hsv-range-control.tsx`: accessible minimum/maximum HSV sliders.

The desktop Python application still runs with `venv/bin/python -m backend.desktop`.

References: [Next.js setup](https://nextjs.org/docs/app/getting-started/installation),
[WebSocket clients](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications),
[JPEG canvas encoding](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob).
