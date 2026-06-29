/**
 * Cron helpers for the autonomous routine schedule (config/routines.ts).
 *
 * Standard 5-field crons (minute hour day-of-month month day-of-week), UTC.
 * `nextCron` is the dashboard's source for "next run": a minute-resolution
 * forward scan, fine for the sub-daily cadences here. Next-run is computed
 * relative to now at render time (the pages are dynamic) — never cached.
 */
import type { Routine } from "@/config/routines";

// Expand one cron field (star, step "x/n", range "a-b", list "a,b", value "a")
// into the set of matching numbers within [min, max].
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
 * if it doesn't parse / doesn't fire within a year. Minute-resolution scan.
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

/**
 * A short, human cadence label derived from the cron itself (so it can never
 * drift from the schedule): "every 6h", "daily", "every other day", or "Nx/day".
 */
export function cadenceLabel(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return "on a schedule";
  const [, hourSpec, domSpec] = parts;
  const domStep = domSpec.match(/^\*\/(\d+)$/);
  if (domStep) {
    const n = parseInt(domStep[1], 10);
    return n === 2 ? "every other day" : `every ${n} days`;
  }
  const hours = [...cronField(hourSpec, 0, 23)].sort((a, b) => a - b);
  if (hours.length <= 1) return "daily";
  const gaps = hours.slice(1).map((h, i) => h - hours[i]);
  const even = gaps.every((g) => g === gaps[0]);
  if (even && 24 % hours.length === 0 && gaps[0] === 24 / hours.length) {
    return `every ${gaps[0]}h`;
  }
  return `${hours.length}x/day`;
}

export interface RoutineRun {
  routine: Routine;
  /** ISO of the next scheduled fire (UTC); null when disabled/unschedulable. */
  nextAt: string | null;
  /** Friendly cadence, e.g. "every 6h". */
  cadence: string;
}

/** Next fire for each routine, computed relative to `nowMs` (UTC). */
export function runsFor(routines: Routine[], nowMs: number = Date.now()): RoutineRun[] {
  return routines.map((routine) => {
    const cadence = cadenceLabel(routine.cron);
    if (!routine.enabled) return { routine, nextAt: null, cadence };
    const t = nextCron(routine.cron, nowMs);
    return { routine, nextAt: t === null ? null : new Date(t).toISOString(), cadence };
  });
}

/** The soonest upcoming run among `runs` (skips disabled / unschedulable). */
export function soonestRun(runs: RoutineRun[]): RoutineRun | null {
  let best: RoutineRun | null = null;
  let bestT = Infinity;
  for (const r of runs) {
    if (!r.nextAt) continue;
    const t = Date.parse(r.nextAt);
    if (t < bestT) {
      best = r;
      bestT = t;
    }
  }
  return best;
}
