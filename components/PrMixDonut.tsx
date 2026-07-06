import type { BucketCount, WorkBucket } from "@/lib/themes";
import { cn } from "@/lib/utils";

/**
 * "Work mix" donut — how the last 7 days of merged PRs split across the four
 * coarse work types (Product / Tests / Infra & upkeep / Fixes). Part-to-whole
 * for a handful of categories, so a donut: the hole carries the 7-day total.
 *
 * Colour follows the entity (fixed per bucket, never by rank), reinforcing the
 * dashboard's own meaning — sage = product (the good output), clay = fixes
 * (rework), amber = tests (the quality gate), muted = plumbing. Identity is
 * never colour-alone: every slice is also in the labelled legend with its count
 * and share, and each arc + row carries a hover title. A 2px surface gap
 * separates the slices. Static SVG (no client JS) — matches WeekBars/Sparkline.
 */

// Fixed bucket → palette token. Ordered in lib/themes.ts so clay/amber never
// end up adjacent arcs (keeps colour-blind separation strong).
const BUCKET_COLOR: Record<WorkBucket, string> = {
  product: "var(--sage)",
  tests: "var(--amber)",
  upkeep: "var(--muted)",
  fixes: "var(--clay)",
};

export function PrMixDonut({
  buckets,
  total,
  size = 128,
  className,
}: {
  buckets: BucketCount[];
  /** The 7-day PR total shown in the hole (buckets sum to this). */
  total: number;
  size?: number;
  className?: string;
}) {
  if (total <= 0 || buckets.length === 0) {
    return (
      <p className="text-sm text-muted">Nothing merged in the last 7 days yet.</p>
    );
  }

  const pct = (n: number) => (n / total) * 100;
  // 2px surface gap between fills → a small dash gap, but only when there's more
  // than one slice (a lone full ring shouldn't carry a seam).
  const GAP = buckets.length > 1 ? 1.6 : 0;
  const STROKE = 13; // in the 100×100 viewBox

  let accum = 0;
  const segs = buckets.map((b) => {
    const p = pct(b.count);
    const seg = {
      ...b,
      p,
      // pathLength is normalised to 100, so a dash of `p - GAP` is exactly the
      // slice minus the seam; the negative offset advances the start to `accum`.
      dash: Math.max(0.0001, p - GAP),
      offset: -accum,
      color: BUCKET_COLOR[b.key],
      share: Math.round(p),
    };
    accum += p;
    return seg;
  });

  return (
    <div className={cn("flex items-center gap-5", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
          role="img"
          aria-label={`Work mix of ${total} merged pull requests: ${buckets
            .map((b) => `${b.label} ${b.count}`)
            .join(", ")}`}
        >
          {/* Track — the seam between slices reads as this surface colour. */}
          <circle
            cx="50"
            cy="50"
            r={50 - STROKE / 2}
            fill="none"
            stroke="var(--hairline)"
            strokeWidth={buckets.length > 1 ? STROKE : 0}
          />
          <g transform="rotate(-90 50 50)">
            {segs.map((s) => (
              <circle
                key={s.key}
                cx="50"
                cy="50"
                r={50 - STROKE / 2}
                fill="none"
                stroke={s.color}
                strokeWidth={STROKE}
                pathLength={100}
                strokeDasharray={`${s.dash} ${100 - s.dash}`}
                strokeDashoffset={s.offset}
              >
                <title>
                  {s.label}: {s.count} PR{s.count === 1 ? "" : "s"} ({s.share}%)
                </title>
              </circle>
            ))}
          </g>
        </svg>
        {/* Centre: the 7-day total fills the hole. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-serif text-2xl font-medium leading-none tabular text-ink">
            {total}
          </span>
          <span className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-muted">
            PRs · 7d
          </span>
        </div>
      </div>

      {/* Legend — identity carried by the label + count + share, not colour alone. */}
      <ul className="min-w-0 flex-1 space-y-1.5">
        {segs.map((s) => (
          <li
            key={s.key}
            className="flex items-center gap-2 text-[13px]"
            title={`${s.label}: ${s.count} of ${total} PRs (${s.share}%)`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-ink">{s.label}</span>
            <span className="tabular font-semibold text-ink">{s.count}</span>
            <span className="w-9 shrink-0 text-right tabular text-muted">
              {s.share}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
