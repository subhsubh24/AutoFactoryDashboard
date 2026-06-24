import type { DailyMetric } from "@/lib/kv";
import type { ProjectSnapshot } from "@/lib/types";

export interface Estimate {
  /** ISO date (YYYY-MM-DD, UTC) of projected completion. */
  date: string;
  daysRemaining: number;
  basis: "history" | "velocity";
  confidence: "low" | "medium";
}

const DAY = 86_400_000;

function addDays(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
}

/** %-per-day from KV history (first→last defined pct over elapsed days). */
function historyRate(
  history: DailyMetric[],
): { rate: number; pct: number; points: number } | null {
  const pts = history.filter(
    (m): m is DailyMetric & { pct: number } => m.pct !== null,
  );
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const days = (Date.parse(last.date) - Date.parse(first.date)) / DAY;
  if (days <= 0) return null;
  return { rate: (last.pct - first.pct) / days, pct: last.pct, points: pts.length };
}

/**
 * Estimate a completion date. Prefers a KV-history pace; falls back to current
 * sub-track velocity (distinct codes shipped in the last 7 days). Returns null
 * when progress is complete, flat, or there's nothing to extrapolate from — an
 * honest "no estimate yet" beats a fabricated date.
 */
export function estimateCompletion(
  snapshot: ProjectSnapshot,
  history: DailyMetric[] | null,
): Estimate | null {
  const current = snapshot.progress.percentToSubmission;
  if (current === null || current >= 100) return null;

  // 1) History-based (trustworthier once several days exist).
  const hr = history ? historyRate(history) : null;
  if (hr && hr.rate > 0.05) {
    const daysRemaining = Math.ceil((100 - hr.pct) / hr.rate);
    if (daysRemaining > 0 && daysRemaining < 3650) {
      return {
        date: addDays(daysRemaining),
        daysRemaining,
        basis: "history",
        confidence: hr.points >= 5 ? "medium" : "low",
      };
    }
  }

  // 2) Velocity fallback: remaining sub-tracks ÷ sub-tracks shipped this week.
  const subtracks = snapshot.progress.subtracks;
  const remaining = subtracks.filter((s) => !s.done).length;
  if (subtracks.length === 0 || remaining === 0) return null;

  const recent = new Set<string>();
  for (const pr of snapshot.merged7dItems) {
    if (pr.track) for (const c of pr.track.split(" · ")) recent.add(c);
  }
  const perWeek = [...recent].filter((c) =>
    subtracks.some((s) => s.code === c),
  ).length;
  if (perWeek <= 0) return null;

  const daysRemaining = Math.ceil((remaining / perWeek) * 7);
  if (daysRemaining <= 0 || daysRemaining > 3650) return null;
  return { date: addDays(daysRemaining), daysRemaining, basis: "velocity", confidence: "low" };
}

/** Compact "Aug 14" label for an estimate date (UTC). */
export function formatEtaDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${d.getUTCDate()}`;
}

/** "~3 weeks" / "~9 days" style horizon label. */
export function formatHorizon(days: number): string {
  if (days <= 21) return `~${days} day${days === 1 ? "" : "s"}`;
  if (days <= 84) return `~${Math.round(days / 7)} weeks`;
  return `~${Math.round(days / 30)} months`;
}
