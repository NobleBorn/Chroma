"use client";

import { useEffect, useRef } from "react";
import type { DetectionResult } from "@/lib/detection-protocol";
import { colorLabel, displayBox, videoRect } from "@/lib/overlay";

type Props = { result: DetectionResult | null; mirrored: boolean; visible: boolean };

export function DetectionOverlay({ result, mirrored, visible }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function draw() {
      if (!canvas) return;
      const { width, height } = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      const context = canvas.getContext("2d");
      if (!context || !width || !height) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      if (!visible || !result) return;
      const rect = videoRect(width, height, result.width, result.height);
      context.font = "11px monospace";
      context.lineWidth = 2;
      for (const box of result.boxes) {
        const display = displayBox(box, rect, result.width, mirrored);
        context.strokeStyle = box.color;
        context.strokeRect(display.x, display.y, display.width, display.height);
        const label = `${colorLabel(box.color)}${box.track_id === null ? "" : ` · #${box.track_id}`}`;
        const labelWidth = Math.min(rect.width, context.measureText(label).width + 12);
        const labelX = Math.max(rect.x, Math.min(display.x, rect.x + rect.width - labelWidth));
        const labelY = Math.max(rect.y, display.y - 21);
        context.fillStyle = box.color;
        context.fillRect(labelX, labelY, labelWidth, 20);
        const rgb = [1, 3, 5].map((offset) => parseInt(box.color.slice(offset, offset + 2), 16));
        context.fillStyle = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 150 ? "#101111" : "#ffffff";
        context.fillText(label, labelX + 6, labelY + 14, Math.max(1, labelWidth - 12));
      }
    }
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    window.addEventListener("resize", draw);
    draw();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, [result, mirrored, visible]);

  return <canvas ref={canvasRef} className="detection-canvas" aria-hidden="true" />;
}
