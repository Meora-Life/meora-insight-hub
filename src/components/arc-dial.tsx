import { scoreColor } from "@/lib/meora";

const SIZE = 128;
const STROKE = 11;
const RADIUS = (SIZE - STROKE) / 2;
const START = 135;
const SWEEP = 270;

function polar(angleDeg: number): [number, number] {
  // 0deg = east, angles increase clockwise; 135 -> 405 leaves the gap at the bottom.
  const rad = (angleDeg * Math.PI) / 180;
  return [SIZE / 2 + RADIUS * Math.cos(rad), SIZE / 2 + RADIUS * Math.sin(rad)];
}

function arcPath(fromDeg: number, toDeg: number): string {
  const [x1, y1] = polar(fromDeg);
  const [x2, y2] = polar(toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${x2} ${y2}`;
}

export function ArcDial({ score, label }: { score: number | null; label: string }) {
  const hasScore = score !== null;
  const end = START + (SWEEP * (hasScore ? score : 0)) / 100;

  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-card px-4 py-5 shadow-[var(--shadow-card)]">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label}>
        <path
          d={arcPath(START, START + SWEEP)}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        {hasScore && score > 0 && (
          <path
            d={arcPath(START, end)}
            fill="none"
            stroke={scoreColor(score)}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
        )}
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 8}
          textAnchor="middle"
          className="font-sans"
          style={{
            fontSize: hasScore ? 30 : 12,
            fontWeight: 800,
            fill: hasScore ? "var(--ink)" : "var(--neutral-status)",
          }}
        >
          {hasScore ? score : "No data"}
        </text>
      </svg>
      <div className="mt-1 text-sm font-semibold text-ink">{label}</div>
      {!hasScore && <div className="mt-0.5 text-xs text-muted-foreground">Insufficient data</div>}
    </div>
  );
}
