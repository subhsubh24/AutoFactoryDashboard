"use client";

import { useState } from "react";
import type { BucketCount, WorkBucket } from "@/lib/themes";
import type { DrillPr } from "@/lib/aggregate";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { DrillDownTable } from "@/components/DrillDownTable";

/**
 * "Work mix" donut — how the last 7 days of merged PRs split across the four
 * coarse work types (Product / Tests / Infra & upkeep / Fixes). Part-to-whole
 * for a handful of categories, so a donut: the hole carries the 7-day total.
 *
 * Colour follows the entity (fixed per bucket, never by rank): sage = product,
 * clay = fixes, amber = tests, muted = plumbing. Identity is never colour-alone:
 * every slice is also in the labelled legend with its count + share. When `rows`
 * is supplied, each slice AND its legend row opens a drill-down — that work
 * type's PRs grouped by project (the legend rows are the keyboard-accessible
 * target; the thin arcs are a mouse bonus).
 */

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
  rows,
}: {
  buckets: BucketCount[];
  /** The 7-day PR total shown in the hole (buckets sum to this). */
  total: number;
  size?: number;
  className?: string;
  /** Underlying PRs — when present, slices/legend rows drill into a breakdown. */
  rows?: DrillPr[];
}) {
  const [openBucket, setOpenBucket] = useState<WorkBucket | null>(null);

  if (total <= 0 || buckets.length === 0) {
    return <p className="text-sm text-muted">Nothing merged in the last 7 days yet.</p>;
  }

  const pct = (n: number) => (n / total) * 100;
  const GAP = buckets.length > 1 ? 1.6 : 0;
  const STROKE = 13;

  let accum = 0;
  const segs = buckets.map((b) => {
    const p = pct(b.count);
    const seg = {
      ...b,
      p,
      dash: Math.max(0.0001, p - GAP),
      offset: -accum,
      color: BUCKET_COLOR[b.key],
      share: Math.round(p),
    };
    accum += p;
    return seg;
  });

  const canDrill = Boolean(rows);
  const openSeg = openBucket ? (segs.find((s) => s.key === openBucket) ?? null) : null;
  const bucketRows = rows && openBucket ? rows.filter((r) => r.bucket === openBucket) : [];
  const projectCount = new Set(bucketRows.map((r) => r.projectSlug)).size;

  return (
    <div className={cn("flex flex-col items-center gap-5", className)}>
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
                onClick={canDrill ? () => setOpenBucket(s.key) : undefined}
                className={canDrill ? "cursor-pointer transition-opacity hover:opacity-80" : undefined}
              >
                <title>
                  {s.label}: {s.count} PR{s.count === 1 ? "" : "s"} ({s.share}%)
                  {canDrill ? " — click for the breakdown" : ""}
                </title>
              </circle>
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-serif text-2xl font-medium leading-none tabular text-ink">
            {total}
          </span>
          <span className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-muted">
            PRs · 7d
          </span>
        </div>
      </div>

      {/* Legend — the keyboard-accessible drill-down target. Identity by label +
          count + share, not colour alone. */}
      <ul className="w-60 max-w-full space-y-0.5 text-sm">
        {segs.map((s) => {
          const inner = (
            <>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-ink">{s.label}</span>
              <span className="tabular font-semibold text-ink">{s.count}</span>
              <span className="w-9 shrink-0 text-right tabular text-muted">{s.share}%</span>
            </>
          );
          return canDrill ? (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => setOpenBucket(s.key)}
                aria-label={`${s.label}: ${s.count} PRs — open the breakdown`}
                title={`${s.label}: ${s.count} of ${total} PRs (${s.share}%) — click for the breakdown`}
                className="-mx-1.5 flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
              >
                {inner}
              </button>
            </li>
          ) : (
            <li
              key={s.key}
              className="flex items-center gap-2.5 px-1.5 py-1"
              title={`${s.label}: ${s.count} of ${total} PRs (${s.share}%)`}
            >
              {inner}
            </li>
          );
        })}
      </ul>

      {rows && (
        <Modal
          open={Boolean(openSeg)}
          onClose={() => setOpenBucket(null)}
          title={openSeg ? `${openSeg.label} · ${bucketRows.length} PR${bucketRows.length === 1 ? "" : "s"}` : ""}
          subtitle={
            openSeg
              ? `${openSeg.share}% of ${total} this week · ${projectCount} project${projectCount === 1 ? "" : "s"}`
              : undefined
          }
        >
          <DrillDownTable rows={bucketRows} />
        </Modal>
      )}
    </div>
  );
}
