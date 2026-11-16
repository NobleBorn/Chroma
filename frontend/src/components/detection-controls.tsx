import { Crosshair, RotateCcw, SlidersHorizontal } from "lucide-react";
import { memo } from "react";
import { COLOR_PRESETS, defaultSettings, settingsForColor } from "@/lib/color-settings";
import { colorLabel } from "@/lib/overlay";
import type { DetectionSettings } from "@/lib/detection-protocol";
import { HsvRangeControl } from "@/components/hsv-range-control";

type Props = {
  settings: DetectionSettings;
  disabled: boolean;
  onChange: (settings: DetectionSettings) => void;
};

export const DetectionControls = memo(function DetectionControls({ settings, disabled, onChange }: Props) {
  return (
    <aside className="panel controls-panel" aria-labelledby="controls-title">
      <div className="panel-heading">
        <h2 id="controls-title"><SlidersHorizontal size={17} /> Color controls</h2>
        <span className="step-badge">{disabled ? "STANDBY" : "LIVE"}</span>
      </div>
      <div className="controls-content">
        <fieldset disabled={disabled} aria-describedby="controls-note">
          <legend className="sr-only">Live color detection settings</legend>
          <div className="control-label"><span>TARGET COLOR</span><Crosshair size={14} /></div>
          <div className="selected-color">
            <label className="color-picker-swatch" style={{ background: settings.color }}>
              <span className="sr-only">Target color</span>
              <input type="color" aria-label="Target color" value={settings.color}
                onChange={(event) => onChange(settingsForColor(event.target.value, settings))} />
            </label>
            <div><strong>{colorLabel(settings.color)}</strong><span>Click swatch to choose</span></div>
            <code>{settings.color.toUpperCase()}</code>
          </div>
          <div className="preset-grid">
            {COLOR_PRESETS.map(({ name, color }) => (
              <button type="button" key={name} aria-pressed={settings.color === color}
                className={`preset ${settings.color === color ? "selected" : ""}`}
                onClick={() => onChange(settingsForColor(color, settings))}>
                <i style={{ background: color }} />{name}
              </button>
            ))}
          </div>
          <div className="control-divider" />
          <div className="control-label"><span>HSV THRESHOLDS</span><span>LIVE TUNING</span></div>
          {["Hue", "Saturation", "Value"].map((name, channel) => (
            <HsvRangeControl key={name} name={name} channel={channel} settings={settings} onChange={onChange} />
          ))}
          <div className="control-divider" />
          <div className="tracking-row">
            <div><strong>Object tracking</strong><span>Smooth movement across frames</span></div>
            <input type="checkbox" role="switch" aria-label="Object tracking" checked={settings.tracking}
              onChange={(event) => onChange({ ...settings, tracking: event.target.checked })} />
          </div>
          <div className="threshold area-control">
            <div><label htmlFor="min-area">Minimum object area</label><code>{settings.min_area.toLocaleString()} <span>px²</span></code></div>
            <input id="min-area" type="range" min={50} max={20000} step={50} value={settings.min_area}
              onChange={(event) => onChange({ ...settings, min_area: Number(event.target.value) })} />
          </div>
          <button type="button" className="button reset-button" onClick={() => onChange(defaultSettings())}>
            <RotateCcw size={13} /> Reset to defaults
          </button>
        </fieldset>
        <p id="controls-note" className="coming-note">
          {disabled ? "Start the camera and connect detection to adjust settings." : "Changes apply live. Raise minimum area to ignore small patches."}
        </p>
      </div>
    </aside>
  );
});
