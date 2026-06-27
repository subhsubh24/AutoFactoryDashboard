import { cn, type Tone } from "@/lib/utils";

const TONE_VAR: Record<Tone, string> = {
  sage: "var(--sage)",
  amber: "var(--amber)",
  clay: "var(--clay)",
  muted: "var(--muted)",
};

/**
 * SVG progress ring. `value` is 0–100, or null for an "unknown" dashed track.
 */
export function ProgressRing({
  value,
  size = 120,
  stroke = 10,
  tone = "clay",
  label,
  sublabel,
  className,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  tone?: Tone;
  label?: string;
  sublabel?: string;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - pct / 100);
  const unknown = value === null;
  const center = size / 2;

  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={unknown ? "Progress unknown" : `${pct}% complete`}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--ring-track)"
          strokeWidth={stroke}
          strokeDasharray={unknown ? "2 6" : undefined}
        />
        {!unknown && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={TONE_VAR[tone]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-content-center px-[14%] text-center leading-none">
        {unknown ? (
          <span className="text-sm text-muted">n/a</span>
        ) : (
          <span
            className="tabular font-semibold text-ink"
            style={{ fontSize: size * 0.26 }}
          >
            {Math.round(pct)}
            <span className="text-muted" style={{ fontSize: size * 0.13 }}>
              %
            </span>
          </span>
        )}
        {label && (
          <span
            className="mt-1 font-medium uppercase leading-[1.25] text-ink/55"
            style={{ fontSize: Math.max(8, size * 0.055), letterSpacing: "0.01em" }}
          >
            {label}
          </span>
        )}
        {sublabel && <span className="mt-0.5 text-[10px] text-muted">{sublabel}</span>}
      </div>
    </div>
  );
}
