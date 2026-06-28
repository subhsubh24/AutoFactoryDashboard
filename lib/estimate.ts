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
  // Use build completeness — the incremental axis — not the step-gate readiness.
  const pts = history.filter(
    (m): m is DailyMetric & { buildPct: number } =>
      m.buildPct !== null && m.buildPct !== undefined,
  );
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const days = (Date.parse(last.date) - Date.parse(first.date)) / DAY;
  if (days <= 0) return null;
  return {
    rate: (last.buildPct - first.buildPct) / days,
    pct: last.buildPct,
    points: pts.length,
  };
}

// Factory PRs aren't 1:1 with roadmap checkboxes — many are fixes, infra, docs,
// or refactors that don't tick a box. This rough divisor maps PR throughput to
// checkbox-completion pace for the no-history fallback. Deliberately
// conservative (assumes fewer boxes-per-PR → a longer, not shorter, estimate).
const VELOCITY_PRS_PER_CHECKBOX = 3;

/**
 * Rough fallback when there's no usable history yet (a brand-new project, or one
 * whose build% has been flat): project a finish from the last 7 days of shipping
 * pace and the remaining build checkboxes. Always low confidence, and the UI
 * labels it "rough". Returns null when not building or not shipping.
 */
function velocityEstimate(snapshot: ProjectSnapshot): Estimate | null {
  const { buildPct, buildDone, buildTotal } = snapshot.progress;
  if (buildPct === null || buildPct >= 100 || buildTotal <= 0) return null;
  const remaining = buildTotal - buildDone;
  if (remaining <= 0) return null;

  const prPerWeek = snapshot.merged7d;
  if (prPerWeek <= 0) return null; // not shipping → nothing to extrapolate

  const checkboxesPerDay = prPerWeek / 7 / VELOCITY_PRS_PER_CHECKBOX;
  const daysRemaining = Math.ceil(remaining / checkboxesPerDay);
  if (daysRemaining <= 0 || daysRemaining > 730) return null; // cap at ~2 years

  return { date: addDays(daysRemaining), daysRemaining, basis: "velocity", confidence: "low" };
}

/**
 * Estimate a completion date. Prefers a KV-history pace on build completeness;
 * when there's no usable history (new project, or flat build%) it falls back to
 * recent shipping velocity (low confidence, labeled "rough" in the UI). Returns
 * null when progress is complete or there's nothing to extrapolate from — an
 * honest "no estimate yet" beats a fabricated date.
 */
export function estimateCompletion(
  snapshot: ProjectSnapshot,
  history: DailyMetric[] | null,
): Estimate | null {
  const current = snapshot.progress.buildPct ?? snapshot.progress.percentToSubmission;
  if (current === null || current >= 100) return null;

  // History-based pace on build completeness — preferred when available.
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

  // No usable history (or flat) → rough velocity fallback from shipping pace.
  return velocityEstimate(snapshot);
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
