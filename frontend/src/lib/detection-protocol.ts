export type DetectionSettings = {
  color: string;
  lower_hsv: [number, number, number];
  upper_hsv: [number, number, number];
  min_area: number;
  tracking: boolean;
};

export const DEFAULT_SETTINGS: DetectionSettings = {
  color: "#ffff00",
  lower_hsv: [18, 100, 100],
  upper_hsv: [40, 255, 255],
  min_area: 700,
  tracking: true,
};

export type DetectionBox = {
  track_id: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export type DetectionResult = {
  type: "result";
  frame_id: number;
  width: number;
  height: number;
  processing_ms: number;
  /** Browser-measured capture/encoding + network + processing, before rendering. */
  round_trip_ms?: number;
  boxes: DetectionBox[];
};

type ServerMessage = DetectionResult | { type: "ready" } | { type: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function integer(value: unknown): value is number {
  return nonnegative(value) && Number.isSafeInteger(value);
}

function isBox(value: unknown): value is DetectionBox {
  return isRecord(value)
    && (value.track_id === null || (integer(value.track_id) && value.track_id > 0))
    && integer(value.x) && integer(value.y)
    && integer(value.width) && value.width > 0
    && integer(value.height) && value.height > 0
    && typeof value.color === "string" && /^#[0-9a-fA-F]{6}$/.test(value.color);
}

export function parseServerMessage(raw: string): ServerMessage {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) throw new Error("Invalid detection response.");
  if (value.type === "ready") return { type: "ready" };
  if (value.type === "error" && typeof value.message === "string") {
    return { type: "error", message: value.message };
  }
  if (value.type === "result" && integer(value.frame_id)
      && integer(value.width) && value.width > 0 && value.width <= 1280
      && integer(value.height) && value.height > 0 && value.height <= 720
      && nonnegative(value.processing_ms)
      && Array.isArray(value.boxes) && value.boxes.every(isBox)) {
    return value as DetectionResult;
  }
  throw new Error("Invalid detection response.");
}

export function detectionSocketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_DETECTION_WS_URL;
  const url = new URL(configured || `ws://${window.location.hostname}:8000/ws/detect`);
  if (!["ws:", "wss:"].includes(url.protocol)) {
    throw new Error("The detection server address must use ws:// or wss://.");
  }
  if (window.location.protocol === "https:" && url.protocol !== "wss:") {
    throw new Error("This HTTPS page requires a secure wss:// detection server address.");
  }
  return url.toString();
}
