"use client";

import { useState } from "react";
import { Activity, Aperture, Camera, Focus, Gauge, ScanLine } from "lucide-react";
import { useCamera } from "@/hooks/use-camera";
import { useDetection } from "@/hooks/use-detection";
import { CameraPanel } from "@/components/camera-panel";
import { DetectionControls } from "@/components/detection-controls";
import { defaultSettings } from "@/lib/color-settings";
import { colorLabel } from "@/lib/overlay";

export function Dashboard() {
  const camera = useCamera();
  const [mirrored, setMirrored] = useState(true);
  const [showBoxes, setShowBoxes] = useState(true);
  const [settings, setSettings] = useState(defaultSettings);
  const live = camera.status === "live";
  const detection = useDetection(camera.videoRef, live, settings);
  const connectionLabel = {
    idle: "Detection standby", connecting: "Connecting detection…",
    connected: "Detection connected", error: "Detection offline",
  }[detection.status];
  function stopCamera() {
    detection.stop();
    camera.stop();
  }
  return (
    <div className="app-shell">
      <header className="site-header">
        <a href="/" className="brand" aria-label="Chroma home"><span className="brand-mark"><Aperture size={27} strokeWidth={1.5} /></span><div><span className="brand-name">Chroma<span className="brand-period">.</span></span><span className="brand-description">COMPUTER VISION</span></div></a>
        <div className="header-right"><span role="status" className={`connection-pill connection-${detection.status}`}><i />{connectionLabel}</span></div>
      </header>
      <main className="pt-7">
        <h1 className="sr-only">Color detection workspace</h1>
        <div className="workspace-grid">
          <CameraPanel videoRef={camera.videoRef} status={camera.status} error={camera.error} info={camera.info} mirrored={mirrored}
            onMirrorChange={() => setMirrored((value) => !value)} onStart={() => void camera.start()} onStop={stopCamera} onResize={camera.updateDimensions}
            detectionStatus={detection.status} detectionError={detection.error} result={detection.result} targetLabel={colorLabel(settings.color)}
            showBoxes={showBoxes} onBoxesChange={() => setShowBoxes((value) => !value)} onRetryDetection={detection.retry} />
          <DetectionControls settings={settings} disabled={!live || detection.status !== "connected"} onChange={setSettings} />
        </div>
        <section className="metrics-grid" aria-label="Camera and detection statistics">
          <div className="metric"><span className="metric-icon"><Camera size={18} /></span><div><span className="metric-label">CAMERA SOURCE</span><strong>{live ? "Connected" : "Standby"}</strong><span>{live ? "Live webcam preview" : "Waiting for camera access"}</span></div><i className={`metric-dot ${live ? "active" : ""}`} /></div>
          <div className="metric"><span className="metric-icon"><ScanLine size={18} /></span><div><span className="metric-label">RESOLUTION</span><strong>{live && camera.info ? `${camera.info.width} × ${camera.info.height}` : "—"}</strong><span>{live ? "Camera capture dimensions" : "Available when camera starts"}</span></div></div>
          <div className="metric"><span className="metric-icon"><Focus size={18} /></span><div><span className="metric-label">DETECTED OBJECTS</span><strong>{detection.result?.boxes.length ?? "—"}</strong><span>{detection.result ? `${settings.tracking ? "Tracked" : "Detected"} ${colorLabel(settings.color).toLowerCase()} regions` : "Waiting for detection results"}</span></div></div>
          <div className="metric"><span className="metric-icon"><Gauge size={18} /></span><div><span className="metric-label">PROCESSING FPS</span><strong>{detection.fps === null ? "—" : detection.fps.toFixed(1)}</strong><span>Completed frames / second</span></div></div>
        </section>
      </main>
      <footer><span>CHROMA <span className="footer-slash">/</span> COLOR TRACKING EXPERIMENT</span></footer>
    </div>
  );
}
