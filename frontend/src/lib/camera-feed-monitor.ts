const FROZEN_FEED_TIMEOUT_MS = 5_000;

/** Watch frame delivery, not image changes: a motionless scene is still healthy. */
export function monitorCameraFeed(video: HTMLVideoElement, onFrozen: () => void): () => void {
  let stopped = false;
  let lastProgress = performance.now();
  let frameCallback: number | undefined;
  const usesFrameCallbacks = typeof video.requestVideoFrameCallback === "function";
  function frameMarker(): number | undefined {
    if (typeof video.getVideoPlaybackQuality === "function") {
      return video.getVideoPlaybackQuality().totalVideoFrames;
    }
    return usesFrameCallbacks ? undefined : video.currentTime;
  }
  let lastMarker = frameMarker();

  function delivered() {
    if (stopped) return;
    lastProgress = performance.now();
    lastMarker = frameMarker();
    frameCallback = video.requestVideoFrameCallback(delivered);
  }

  function reset() {
    // Background tabs may intentionally stop rendering video. Give the camera
    // a full grace period when the visitor returns.
    lastProgress = performance.now();
    lastMarker = frameMarker();
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", reset);
    if (frameCallback !== undefined && typeof video.cancelVideoFrameCallback === "function") {
      video.cancelVideoFrameCallback(frameCallback);
    }
  }

  if (usesFrameCallbacks) frameCallback = video.requestVideoFrameCallback(delivered);
  document.addEventListener("visibilitychange", reset);
  const timer = setInterval(() => {
    if (document.hidden) {
      reset();
      return;
    }
    // Decoding may continue when a video scrolls offscreen even if compositor
    // callbacks are throttled. Count that as a healthy feed, too.
    const marker = frameMarker();
    if (marker !== undefined) {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0
          && !video.paused && marker !== lastMarker) {
        lastProgress = performance.now();
      }
      lastMarker = marker;
    }
    if (performance.now() - lastProgress >= FROZEN_FEED_TIMEOUT_MS) {
      stop();
      onFrozen();
    }
  }, 500);
  return stop;
}
