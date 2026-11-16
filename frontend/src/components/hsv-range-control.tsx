import type { DetectionSettings } from "@/lib/detection-protocol";
import { updateHsvBound } from "@/lib/color-settings";

type Props = {
  name: string;
  channel: number;
  settings: DetectionSettings;
  onChange: (settings: DetectionSettings) => void;
};

export function HsvRangeControl({ name, channel, settings, onChange }: Props) {
  const key = name.toLowerCase();
  const min = settings.lower_hsv[channel];
  const max = settings.upper_hsv[channel];
  return (
    <div className="threshold">
      <div className="threshold-heading"><span>{name}</span><code>{min} <span>—</span> {max}</code></div>
      {(["min", "max"] as const).map((bound) => (
        <div className="hsv-slider-row" key={bound}>
          <label htmlFor={`${key}-${bound}`}>{bound === "min" ? "Min" : "Max"}</label>
          <input id={`${key}-${bound}`} aria-label={`${name} ${bound === "min" ? "minimum" : "maximum"}`}
            className={`range-${key}`} type="range" min={0} max={channel === 0 ? 179 : 255}
            value={bound === "min" ? min : max}
            onChange={(event) => onChange(updateHsvBound(settings, channel, bound, Number(event.target.value)))} />
          <output htmlFor={`${key}-${bound}`}>{bound === "min" ? min : max}</output>
        </div>
      ))}
      {channel === 0 && min > max ? <p className="hue-wrap-note">Wraps through 0 to include red.</p> : null}
    </div>
  );
}
