/**
 * The autonomous loop's published schedule, read from docs/autonomous-loop/
 * (README.md / PROMPT.md). The loop is a scheduled cloud Claude Code routine;
 * its cadence is documented there — either as an explicit cron (a "Routine
 * cadence:" line in backticks) or in prose ("runs every 6h"). We read it from
 * the repo and compute the next run authoritatively; when a repo doesn't publish a
 * cadence we show nothing rather than guess (the cadence varies per project —
 * a global assumption would be wrong).
 */
import type { Availability } from "@/lib/types";

export interface RoutineSchedule extends Availability {
  sourceUrl?: string;
  /** 5-field cron string when published (every-N-hours, daily, etc.); else null. */
  cron: string | null;
  /** Cadence in hours when stated (prose "every 6h", or derived from cron). */
  cadenceHours: number | null;
  /** Short human label, e.g. "every 3h". */
  label: string | null;
}

/** Expand one cron field (star, step, range "1-5", list "0,30", or value) into a set. */
function cronField(spec: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const [rangeRaw, stepRaw] = part.split("/");
    const step = stepRaw ? parseInt(stepRaw, 10) : 1;
    if (!Number.isFinite(step) || step < 1) continue;
    let lo = min;
    let hi = max;
    if (rangeRaw !== "*" && rangeRaw !== "") {
      const dash = rangeRaw.split("-");
      lo = parseInt(dash[0], 10);
      // "a/n" means a..max step n; "a-b" means a..b; "a" means just a.
      hi = dash[1] !== undefined ? parseInt(dash[1], 10) : stepRaw ? max : lo;
    }
    if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
    for (let v = lo; v <= hi; v += step) if (v >= min && v <= max) out.add(v);
  }
  return out;
}

/**
 * Next UTC fire time (ms) for a standard 5-field cron at/after `fromMs`, or null
 * if it doesn't parse / doesn't fire within a year. Minute-resolution scan —
 * fine for the sub-daily cadences here.
 */
export function nextCron(expr: string, fromMs: number): number | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const mins = cronField(parts[0], 0, 59);
  const hours = cronField(parts[1], 0, 23);
  const doms = cronField(parts[2], 1, 31);
  const mons = cronField(parts[3], 1, 12);
  const dows = cronField(parts[4], 0, 6);
  if ([mins, hours, doms, mons, dows].some((s) => s.size === 0)) return null;
  const domRestricted = parts[2] !== "*";
  const dowRestricted = parts[4] !== "*";

  let t = Math.floor(fromMs / 60_000) * 60_000 + 60_000; // next whole minute
  const cap = t + 367 * 24 * 60 * 60_000;
  for (; t <= cap; t += 60_000) {
    const d = new Date(t);
    if (!mins.has(d.getUTCMinutes())) continue;
    if (!hours.has(d.getUTCHours())) continue;
    if (!mons.has(d.getUTCMonth() + 1)) continue;
    const dom = doms.has(d.getUTCDate());
    const dow = dows.has(d.getUTCDay());
    // Standard cron quirk: if BOTH day-of-month and day-of-week are restricted,
    // a match on EITHER fires; otherwise both must hold.
    const dayOk = domRestricted && dowRestricted ? dom || dow : dom && dow;
    if (dayOk) return t;
  }
  return null;
}

/** Pull the cron / cadence out of the autonomous-loop docs. */
export function parseRoutineSchedule(
  md: string | null | undefined,
  fileUrl?: string,
): RoutineSchedule {
  const blank: RoutineSchedule = {
    available: false,
    cron: null,
    cadenceHours: null,
    label: null,
    sourceUrl: fileUrl,
  };
  if (!md || !md.trim()) {
    return { ...blank, reason: "autonomous-loop docs not found" };
  }

  // Explicit cron near the word "cadence", in backticks: `0 */3 * * *`.
  let cron: string | null = null;
  const m = md.match(/cadence[^\n`]*`([0-9*/,\s-]+)`/i);
  if (m) {
    const cand = m[1].trim().replace(/\s+/g, " ");
    if (cand.split(" ").length === 5) cron = cand;
  }

  // Prose cadence: "every 6h" / "every 3 hours".
  let cadenceHours: number | null = null;
  const p = md.match(/every\s+(\d+)\s*(?:h\b|hours?\b|-?\s*hours?\b)/i);
  if (p) cadenceHours = parseInt(p[1], 10);

  // Derive cadence from a simple "0 */N * * *" cron when prose didn't state it.
  if (cadenceHours === null && cron) {
    const hm = cron.split(" ")[1].match(/^\*\/(\d+)$/);
    if (hm) cadenceHours = parseInt(hm[1], 10);
  }

  if (!cron && cadenceHours === null) return { ...blank, reason: "no cadence stated" };

  return {
    available: true,
    cron,
    cadenceHours,
    label: cadenceHours ? `every ${cadenceHours}h` : cron,
    sourceUrl: fileUrl,
  };
}

export interface NextRunInfo {
  /** ISO of the next run; null when unknown or overdue. */
  at: string | null;
  /** How `at` was derived: exact from cron, or interval from cadence. */
  basis: "cron" | "cadence" | null;
  /** The loop is stalled / past due — show "overdue", not a fake future time. */
  overdue: boolean;
}

/**
 * The next run: exact from cron when published, else last-ship + cadence, else
 * unknown. A stalled loop reads "overdue" (the schedule says it should have run).
 */
export function nextRoutineRun(
  r: RoutineSchedule,
  lastShipAt: string | null,
  stalled: boolean,
  nowMs: number = Date.now(),
): NextRunInfo {
  if (!r.available) return { at: null, basis: null, overdue: false };
  const cadenceMs = (r.cadenceHours ?? 0) * 3_600_000;
  const lastMs = lastShipAt ? Date.parse(lastShipAt) : NaN;
  // Guardrail — validate the documented cadence against reality: if the loop
  // hasn't actually shipped within ~1.5× its own stated cadence (or is globally
  // stalled), it's behind schedule. Show "overdue", never a confident future time
  // implied by a cadence the loop clearly isn't keeping.
  const behindCadence =
    cadenceMs > 0 && !Number.isNaN(lastMs) && nowMs - lastMs > cadenceMs * 1.5;
  if (stalled || behindCadence) {
    return { at: null, basis: r.cron ? "cron" : "cadence", overdue: true };
  }
  if (r.cron) {
    const t = nextCron(r.cron, nowMs);
    if (t !== null) return { at: new Date(t).toISOString(), basis: "cron", overdue: false };
  }
  if (cadenceMs > 0 && !Number.isNaN(lastMs)) {
    return {
      at: new Date(lastMs + cadenceMs).toISOString(),
      basis: "cadence",
      overdue: false,
    };
  }
  return { at: null, basis: null, overdue: false };
}
