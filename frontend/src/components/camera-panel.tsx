"use client";

import { Camera, CameraOff, CircleHelp, LoaderCircle, Play, ShieldCheck, Square } from "lucide-react";
import type { RefObject } from "react";
import type { CameraInfo, CameraStatus } from "@/hooks/use-camera";
import type { DetectionStatus } from "@/hooks/use-detection";
import type { DetectionResult } from "@/lib/detection-protocol";
import { DetectionOverlay } from "@/components/detection-overlay";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string | null;
  info: CameraInfo | null;
  mirrored: boolean;
  onMirrorChange: () => void;
  onStart: () => void;
  onStop: () => void;
  onResize: () => void;
  detectionStatus: DetectionStatus;
  detectionError: string | null;
  result: DetectionResult | null;
  showBoxes: boolean;
  onBoxesChange: () => void;
  onRetryDetection: () => void;
  targetLabel: string;
};

export function CameraPanel({ videoRef, status, error, info, mirrored, onMirrorChange, onStart, onStop, onResize,
  detectionStatus, detectionError, result, showBoxes, onBoxesChange, onRetryDetection, targetLabel }: Props) {
  const live = status === "live";
  const requesting = status === "requesting";
  return (
    <section className="panel camera-panel" aria-labelledby="camera-title">
      <div className="panel-heading">
        <h2 id="camera-title"><Camera size={17} /> Live camera feed</h2>
        <span className={`status-tag ${live ? "is-live" : ""}`}><i />{live ? "LIVE" : requesting ? "CONNECTING" : "STANDBY"}</span>
      </div>
      <div className="camera-stage">
        <video ref={videoRef} autoPlay muted playsInline onResize={onResize} aria-label="Live webcam preview"
          className={`${mirrored ? "mirrored" : ""} ${live ? "" : "video-hidden"}`} />
        <DetectionOverlay result={live ? result : null} mirrored={mirrored} visible={live && showBoxes} />
        <div className="stage-label"><span className="tiny-dot" /> CAM 01 <span className="stage-label-divider">/</span> WEBCAM</div>
        <div className="stage-corners" aria-hidden="true"><i /><i /><i /><i /></div>
        {!live ? (
          <div className="camera-empty">
            <div className="camera-icon">{requesting ? <LoaderCircle size={28} className="spin" /> : <CameraOff size={28} strokeWidth={1.4} />}</div>
            <span className="eyebrow">{requesting ? "AWAITING PERMISSION" : ""}</span>
            <h3>{requesting ? "Allow camera access" : "Detect Colors"}</h3>
            <p>{requesting ? "Your browser will ask to use your camera. No microphone access is needed." : "Start your webcam."}</p>
            {!requesting ? <button type="button" className="button button-primary" onClick={onStart}><Play size={14} fill="currentColor" />{status === "error" ? "Try camera again" : "Start camera"}</button> : null}
            <span className="permission-hint">{requesting ? "You can cancel using the button below." : "Camera permission is requested only when you start."}</span>
          </div>
        ) : (
          <div className="live-overlay"><span><i className="tiny-dot" />{detectionStatus === "connected" ? `${targetLabel} detection active` : detectionStatus === "connecting" ? "Connecting detection…" : "Camera preview active"}</span><span>{result ? `${result.round_trip_ms ?? Math.round(result.processing_ms)} ms / round trip` : info ? `${info.width} × ${info.height}` : "WEBCAM"}</span></div>
        )}
      </div>
      {error ? <div className="error-message" role="alert"><CircleHelp size={17} /><p>{error}</p></div> : null}
      {live && detectionError ? <div className="error-message detection-error" role="alert"><CircleHelp size={17} /><p>{detectionError}</p><button type="button" className="button" onClick={onRetryDetection}>Retry detection</button></div> : null}
      <div className="camera-toolbar">
        <div className="toolbar-actions">
          <button type="button" className={`button ${live || requesting ? "button-stop" : "button-primary"}`} onClick={live || requesting ? onStop : onStart}>
            {live || requesting ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            {live ? "Stop camera" : requesting ? "Cancel request" : "Start camera"}
          </button>
          <label className="mirror-control"><input type="checkbox" checked={mirrored} disabled={!live} onChange={onMirrorChange} /> Mirror preview</label>
          <label className="mirror-control"><input type="checkbox" checked={showBoxes} disabled={!live || detectionStatus !== "connected"} onChange={onBoxesChange} /> Show boxes</label>
        </div>
        <span className="source-label">{live ? "Local camera" : "No active source"}</span>
      </div>
      <div className="privacy-note"><ShieldCheck size={16} /><p>Starting the camera sends compressed frames to the Python server for color detection. Frames are processed in memory and are not saved. No microphone access is requested.</p></div>
    </section>
  );
}
