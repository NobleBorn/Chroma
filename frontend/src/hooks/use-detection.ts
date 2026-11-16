"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { DetectionStream } from "@/lib/detection-stream";
import { detectionSocketUrl } from "@/lib/detection-protocol";
import type { DetectionResult, DetectionSettings } from "@/lib/detection-protocol";

export type DetectionStatus = "idle" | "connecting" | "connected" | "error";

type DetectionState = {
  status: DetectionStatus;
  result: DetectionResult | null;
  fps: number | null;
  error: string | null;
};

const IDLE: DetectionState = { status: "idle", result: null, fps: null, error: null };

export function useDetection(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean, settings: DetectionSettings) {
  const streamRef = useRef<DetectionStream | null>(null);
  const settingsRef = useRef(settings);
  const [state, setState] = useState<DetectionState>(IDLE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    settingsRef.current = settings;
    streamRef.current?.setSettings(settings);
    setState((previous) => ({ ...previous, result: null }));
  }, [settings]);

  const stop = useCallback(() => {
    streamRef.current?.stop();
    streamRef.current = null;
    setState(IDLE);
  }, []);

  useEffect(() => {
    if (!enabled || !videoRef.current) {
      stop();
      return;
    }
    setState({ ...IDLE, status: "connecting" });
    const stream = new DetectionStream(videoRef.current, {
      onConnected: () => setState({ ...IDLE, status: "connected" }),
      onResult: (result, fps) => setState({ status: "connected", result, fps, error: null }),
      onError: (error) => setState({ ...IDLE, status: "error", error }),
    }, settingsRef.current);
    streamRef.current = stream;
    try {
      stream.start(detectionSocketUrl());
    } catch (error) {
      stream.stop();
      setState({ ...IDLE, status: "error", error: error instanceof Error ? error.message : "Invalid detection address." });
    }
    // Stop transmission immediately when leaving, including bfcache navigation.
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      stream.stop();
      if (streamRef.current === stream) streamRef.current = null;
    };
  }, [enabled, attempt, stop, videoRef]);

  return { ...state, stop, retry: () => setAttempt((value) => value + 1) };
}
