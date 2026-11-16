import { DEFAULT_SETTINGS, parseServerMessage } from "./detection-protocol";
import type { DetectionResult, DetectionSettings } from "./detection-protocol";
import { copySettings } from "./color-settings";

const FRAME_INTERVAL_MS = 1000 / 30;
const RESPONSE_TIMEOUT_MS = 10_000;
const MAX_WIDTH = 960;
const MAX_HEIGHT = 540;

type Callbacks = {
  onConnected: () => void;
  onResult: (result: DetectionResult, fps: number | null) => void;
  onError: (message: string) => void;
};

function jpegBase64(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== "image/jpeg") {
        reject(new Error("This browser could not encode a JPEG camera frame."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read the camera frame."));
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.readAsDataURL(blob);
    }, "image/jpeg", 0.8);
  });
}

/** Owns one connection. Capture is scheduled only after the previous reply. */
export class DetectionStream {
  private socket: WebSocket | null = null;
  private canvas = document.createElement("canvas");
  private timer: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private ready = false;
  private frameId = 0;
  private pending: { id: number; width: number; height: number; started: number; revision: number } | null = null;
  private revision = 0;
  private sampleStarted = 0;
  private completedFrames = 0;
  private fps: number | null = null;

  constructor(
    private video: HTMLVideoElement,
    private callbacks: Callbacks,
    private settings: DetectionSettings = DEFAULT_SETTINGS,
  ) {
    this.settings = copySettings(settings);
  }

  setSettings(settings: DetectionSettings) {
    if (JSON.stringify(settings) === JSON.stringify(this.settings)) return;
    this.settings = copySettings(settings);
    this.revision += 1;
  }

  start(url: string) {
    try {
      this.socket = new WebSocket(url);
      this.deadline = setTimeout(() => this.fail("The detection server did not respond. Check that the Python backend is running."), RESPONSE_TIMEOUT_MS);
      this.socket.onmessage = (event: MessageEvent) => this.receive(event);
      this.socket.onerror = () => this.fail("Could not connect to detection. Check the backend address and allowed browser origin, then retry.");
      this.socket.onclose = () => this.fail("Detection disconnected. Your camera preview is still available. Retry to reconnect.");
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Could not open detection connection.");
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    this.pending = null;
    if (this.socket) {
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    this.canvas.width = 0;
    this.canvas.height = 0;
  }

  private fail(message: string) {
    if (this.stopped) return;
    this.stop();
    this.callbacks.onError(message);
  }

  private receive(event: MessageEvent) {
    if (this.stopped) return;
    try {
      if (typeof event.data !== "string") throw new Error("Unexpected detection response format.");
      const message = parseServerMessage(event.data);
      if (message.type === "error") throw new Error(message.message);
      if (message.type === "ready") {
        if (this.ready) throw new Error("Unexpected detection handshake.");
        clearTimeout(this.deadline);
        this.ready = true;
        this.sampleStarted = performance.now();
        this.callbacks.onConnected();
        this.schedule(0);
        return;
      }
      if (!this.pending || message.frame_id !== this.pending.id
          || message.width !== this.pending.width || message.height !== this.pending.height) {
        throw new Error("Detection returned an unexpected frame. Retry to start a fresh session.");
      }
      clearTimeout(this.deadline);
      const started = this.pending.started;
      const revision = this.pending.revision;
      this.pending = null;
      this.completedFrames += 1;
      const now = performance.now();
      if (now - this.sampleStarted >= 1000) {
        this.fps = this.completedFrames * 1000 / (now - this.sampleStarted);
        this.sampleStarted = now;
        this.completedFrames = 0;
      }
      // A reply from the previous target must not reappear after a control change.
      if (revision === this.revision) {
        this.callbacks.onResult({ ...message, round_trip_ms: Math.round(now - started) }, this.fps);
      }
      this.schedule(Math.max(0, FRAME_INTERVAL_MS - (now - started)));
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Could not read detection results.");
    }
  }

  private schedule(delay: number) {
    if (!this.stopped) this.timer = setTimeout(() => void this.capture(), delay);
  }

  private async capture() {
    if (this.stopped || !this.ready || this.pending || this.socket?.readyState !== WebSocket.OPEN) return;
    const video = this.video;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      this.schedule(100);
      return;
    }
    // Reserve the slot before asynchronous encoding so no two captures overlap.
    const scale = Math.min(1, MAX_WIDTH / video.videoWidth, MAX_HEIGHT / video.videoHeight);
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const frame = { id: this.frameId++, width, height, started: performance.now(), revision: this.revision };
    const settings = copySettings(this.settings);
    this.pending = frame;
    this.deadline = setTimeout(() => this.fail("Detection timed out. Retry to reconnect to the Python server."), RESPONSE_TIMEOUT_MS);
    try {
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
      const context = this.canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not prepare camera frames.");
      context.drawImage(video, 0, 0, width, height);
      const image = await jpegBase64(this.canvas);
      if (this.stopped || this.socket?.readyState !== WebSocket.OPEN) return;
      this.socket.send(JSON.stringify({ type: "frame", frame_id: frame.id, image, settings }));
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Could not send a camera frame.");
    }
  }
}
