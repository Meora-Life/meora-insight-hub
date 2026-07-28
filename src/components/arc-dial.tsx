import { scoreColor } from "@/lib/meora";

const SIZE = 132;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2 - 2;
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

const angleFor = (score: number) => START + (SWEEP * score) / 100;

/** Colour bands: red 0–49, amber 50–79, green 80–100. */
const BANDS = [
  { from: 0, to: 49, color: "var(--outofrange)" },
  { from: 50, to: 79, color: "var(--suboptimal)" },
  { from: 80, to: 100, color: "var(--optimal)" },
];

export function ArcDial({
  score,
  label,
  count,
  onClick,
  active = false,
}: {
  score: number | null;
  label: string;
  count?: number;
  onClick?: () => void;
  active?: boolean;
}) {
  const hasScore = score !== null;
  const end = angleFor(hasScore ? score : 0);
  const interactive = Boolean(onClick);

  const body = (
    <>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label}>
        {/* faint colour-banded track */}
        {BANDS.map((b) => (
          <path
            key={b.from}
            d={arcPath(angleFor(b.from), angleFor(b.to))}
            fill="none"
            stroke={b.color}
            strokeOpacity={0.16}
            strokeWidth={STROKE}
            strokeLinecap="butt"
          />
        ))}
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
          y={SIZE / 2 + 12}
          textAnchor="middle"
          className="font-sans"
          style={{
            fontSize: hasScore ? 38 : 13,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            fill: hasScore ? "var(--ink)" : "var(--neutral-status)",
          }}
        >
          {hasScore ? score : "No data"}
        </text>
      </svg>
      <div className="mt-2 text-sm font-extrabold tracking-tight text-ink">{label}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {hasScore
          ? `${count ?? 0} biomarker${count === 1 ? "" : "s"}${interactive ? " — view detail" : ""}`
          : "Insufficient data"}
      </div>
    </>
  );

  const base = `flex flex-col items-center rounded-xl border bg-card px-4 py-5 shadow-[var(--shadow-card)] transition ${
    active ? "border-primary ring-2 ring-primary/30" : "border-border"
  }`;

  if (!interactive) return <div className={base}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={`${base} text-left hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      {body}
    </button>
  );
}
