import { DEFAULT_SETTINGS } from "./detection-protocol";
import type { DetectionSettings } from "./detection-protocol";

export const COLOR_PRESETS = [
  { name: "Red", color: "#ff0000" },
  { name: "Green", color: "#00ff00" },
  { name: "Blue", color: "#0000ff" },
  { name: "Yellow", color: "#ffff00" },
  { name: "Orange", color: "#ffa500" },
  { name: "Purple", color: "#800080" },
];

export function copySettings(settings: DetectionSettings): DetectionSettings {
  return { ...settings, lower_hsv: [...settings.lower_hsv], upper_hsv: [...settings.upper_hsv] };
}

export function defaultSettings(): DetectionSettings {
  return copySettings(DEFAULT_SETTINGS);
}

/** Convert an RGB picker value into OpenCV HSV units (H: 0–179, S/V: 0–255). */
export function hexToHsv(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error("Expected a six-digit hex color.");
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const difference = max - min;
  let hue = 0;
  if (difference) {
    if (max === r) hue = ((g - b) / difference) % 6;
    else if (max === g) hue = (b - r) / difference + 2;
    else hue = (r - g) / difference + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return [Math.round(hue / 2) % 180, Math.round(max ? difference / max * 255 : 0), Math.round(max * 255)];
}

export function settingsForColor(color: string, previous: DetectionSettings): DetectionSettings {
  const normalized = color.toLowerCase();
  const [hue, saturation, value] = hexToHsv(normalized);
  const ignoreHue = saturation < 50 || value < 50;
  return {
    ...previous,
    color: normalized,
    lower_hsv: [
      ignoreHue ? 0 : normalized === DEFAULT_SETTINGS.color ? DEFAULT_SETTINGS.lower_hsv[0] : (hue + 170) % 180,
      value < 50 ? 0 : Math.min(100, Math.max(0, saturation - 50)),
      Math.min(100, Math.max(0, value - 50)),
    ],
    upper_hsv: [
      ignoreHue ? 179 : (hue + 10) % 180,
      saturation < 50 && value >= 50 ? Math.min(255, saturation + 50) : 255,
      value < 50 ? Math.min(255, value + 50) : 255,
    ],
  };
}

export function updateHsvBound(settings: DetectionSettings, channel: number, bound: "min" | "max", value: number): DetectionSettings {
  const next = copySettings(settings);
  const limit = channel === 0 ? 179 : 255;
  const clamped = Math.max(0, Math.min(limit, Math.round(value)));
  // Hue may wrap through zero; saturation/value intervals stay ordered.
  if (bound === "min") next.lower_hsv[channel] = channel === 0 ? clamped : Math.min(clamped, next.upper_hsv[channel]);
  else next.upper_hsv[channel] = channel === 0 ? clamped : Math.max(clamped, next.lower_hsv[channel]);
  return next;
}
