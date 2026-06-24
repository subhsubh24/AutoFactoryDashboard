import { cn, type Tone } from "@/lib/utils";

const TONE_VAR: Record<Tone, string> = {
  sage: "var(--sage)",
  amber: "var(--amber)",
  clay: "var(--clay)",
  muted: "var(--muted)",
};

/**
 * Lightweight inline-SVG sparkline (area + line). No chart dependency.
 * `values` are plotted left→right; gaps (null) are skipped.
 */
export function Sparkline({
  values,
  width = 220,
  height = 48,
  tone = "clay",
  className,
  fillOpacity = 0.12,
  max,
}: {
  values: Array<number | null>;
  width?: number;
  height?: number;
  tone?: Tone;
  className?: string;
  fillOpacity?: number;
  max?: number;
}) {
  const points = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null);

  if (points.length === 0) {
    return (
      <div
        className={cn("grid place-items-center text-[11px] text-muted", className)}
        style={{ width, height }}
      >
        no data
      </div>
    );
  }

  const pad = 3;
  const n = values.length;
  const hi = max ?? Math.max(...points.map((p) => p.v), 1);
  const lo = Math.min(...points.map((p) => p.v), 0);
  const span = hi - lo || 1;

  const x = (i: number) =>
    n <= 1 ? width / 2 : pad + (i / (n - 1)) * (width - pad * 2);
  const y = (v: number) =>
    height - pad - ((v - lo) / span) * (height - pad * 2);

  const line = points
    .map((p, idx) => `${idx === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join(" ");

  const area =
    `M${x(points[0].i).toFixed(1)},${(height - pad).toFixed(1)} ` +
    points.map((p) => `L${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ") +
    ` L${x(points[points.length - 1].i).toFixed(1)},${(height - pad).toFixed(1)} Z`;

  const last = points[points.length - 1];
  const color = TONE_VAR[tone];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <path d={area} fill={color} fillOpacity={fillOpacity} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={x(last.i)} cy={y(last.v)} r={2.5} fill={color} />
    </svg>
  );
}
