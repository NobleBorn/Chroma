import type { DetectionBox } from "./detection-protocol";

/** Match object-fit: contain, including any horizontal or vertical black bars. */
export function videoRect(width: number, height: number, sourceWidth: number, sourceHeight: number) {
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  return {
    x: (width - sourceWidth * scale) / 2,
    y: (height - sourceHeight * scale) / 2,
    width: sourceWidth * scale,
    height: sourceHeight * scale,
    scale,
  };
}

export function displayBox(box: DetectionBox, rect: ReturnType<typeof videoRect>, sourceWidth: number, mirrored: boolean) {
  return {
    x: rect.x + (mirrored ? sourceWidth - box.x - box.width : box.x) * rect.scale,
    y: rect.y + box.y * rect.scale,
    width: box.width * rect.scale,
    height: box.height * rect.scale,
  };
}

export function colorLabel(color: string) {
  const names: Record<string, string> = {
    "#ffff00": "Yellow", "#ff0000": "Red", "#00ff00": "Green",
    "#0000ff": "Blue", "#ffa500": "Orange", "#800080": "Purple",
  };
  return names[color.toLowerCase()] ?? color.toUpperCase();
}
