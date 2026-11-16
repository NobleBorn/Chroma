"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { monitorCameraFeed } from "@/lib/camera-feed-monitor";

export type CameraStatus = "idle" | "requesting" | "live" | "error";
export type CameraInfo = { width: number; height: number; frameRate: number | null };

function cameraError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
        return "Camera access was blocked. Allow camera access in your browser’s site settings, then try again.";
      case "NotFoundError":
        return "No camera was found. Connect a webcam and try again.";
      case "NotReadableError":
        return "Your camera could not be opened. Close other apps using it, then try again.";
      case "OverconstrainedError":
        return "Your camera could not use these video settings. Try another camera or browser.";
      case "SecurityError":
        return "Camera access is disabled by your browser’s security settings.";
    }
  }
  return "The camera could not start. Check that it is connected and try again.";
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const startingRef = useRef(false);
  const stopMonitorRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<CameraInfo | null>(null);

  const release = useCallback(() => {
    generationRef.current += 1;
    startingRef.current = false;
    stopMonitorRef.current?.();
    stopMonitorRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stop = useCallback(() => {
    release();
    setStatus("idle");
    setInfo(null);
    setError(null);
  }, [release]);

  useEffect(() => {
    // Release hardware on navigation, tab closure, and component unmount.
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      release();
    };
  }, [release, stop]);

  const start = useCallback(async () => {
    if (startingRef.current || streamRef.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera access requires HTTPS or localhost and a browser with webcam support.");
      setStatus("error");
      return;
    }
    startingRef.current = true;
    const generation = ++generationRef.current;
    setError(null);
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      // A cancelled request can still resolve after permission is granted.
      if (generation !== generationRef.current || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      track.addEventListener("ended", () => {
        if (streamRef.current !== stream) return;
        release();
        setInfo(null);
        setError("The camera disconnected or access was revoked. Reconnect it and try again.");
        setStatus("error");
      }, { once: true });
      videoRef.current.srcObject = stream;
      stopMonitorRef.current = monitorCameraFeed(videoRef.current, () => {
        if (streamRef.current !== stream) return;
        release();
        setInfo(null);
        setError("The camera stopped delivering video frames. Check your camera connection and try again.");
        setStatus("error");
      });
      await videoRef.current.play();
      if (generation !== generationRef.current) return;
      const settings = track.getSettings();
      setInfo({
        width: videoRef.current?.videoWidth || settings.width || 0,
        height: videoRef.current?.videoHeight || settings.height || 0,
        frameRate: settings.frameRate ?? null,
      });
      startingRef.current = false;
      setStatus("live");
    } catch (cause) {
      if (generation !== generationRef.current) return;
      release();
      setInfo(null);
      setError(cameraError(cause));
      setStatus("error");
    }
  }, [release]);

  const updateDimensions = useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return;
    setInfo((previous) => ({
      width: video.videoWidth,
      height: video.videoHeight,
      frameRate: previous?.frameRate ?? null,
    }));
  }, []);

  return { videoRef, status, error, info, start, stop, updateDimensions };
}
