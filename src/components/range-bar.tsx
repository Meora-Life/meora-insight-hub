import type { RangeBarModel } from "@/lib/meora";

const WIDTH = 200;
const HEIGHT = 26;

function pct(value: number, model: RangeBarModel): number {
  const raw = (value - model.min) / (model.max - model.min);
  return Math.min(1, Math.max(0, raw));
}

export function RangeBar({ model, markerColor }: { model: RangeBarModel; markerColor: string }) {
  const trackY = HEIGHT / 2 - 4;
  const trackH = 8;

  const rangeX = pct(model.rangeStart, model) * WIDTH;
  const rangeW = Math.max(2, (pct(model.rangeEnd, model) - pct(model.rangeStart, model)) * WIDTH);
  const optX = pct(model.optimalStart, model) * WIDTH;
  const optW = Math.max(2, (pct(model.optimalEnd, model) - pct(model.optimalStart, model)) * WIDTH);
  const markerX = model.marker === null ? null : pct(model.marker, model) * WIDTH;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      height={HEIGHT}
      role="img"
      aria-label="Reference range position"
      className="max-w-[220px]"
    >
      <rect x={0} y={trackY} width={WIDTH} height={trackH} rx={4} fill="var(--muted)" />
      <rect
        x={rangeX}
        y={trackY}
        width={rangeW}
        height={trackH}
        rx={4}
        fill="var(--neutral-status)"
        opacity={0.22}
      />
      <rect
        x={optX}
        y={trackY}
        width={optW}
        height={trackH}
        rx={4}
        fill="var(--optimal)"
        opacity={0.35}
      />
      {markerX !== null && (
        <g>
          <circle cx={markerX} cy={HEIGHT / 2} r={6.5} fill="var(--card)" />
          <circle cx={markerX} cy={HEIGHT / 2} r={5} fill={markerColor} />
        </g>
      )}
    </svg>
  );
}
