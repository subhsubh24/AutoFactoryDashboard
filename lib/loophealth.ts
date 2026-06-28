/**
 * docs/autonomous-loop/LOOP_HEALTH.md → LoopHealth.
 *
 * Each run, the autonomous loop reports its OWN health in a fenced LOOP_HEALTH
 * block — "is it making progress, or hitting the same wall every run?". We
 * surface the signal, the run/7-day counts, and the recurring failures that the
 * loop can't get past on its own (→ a harness proposal for the owner, Directive
 * A). REAL data only: 0/null/bootstrapping read as "not reported yet", never a
 * guess. A missing or unparseable block degrades to `available: false`.
 */
import type { Availability } from "@/lib/types";
import { parseYamlBlock } from "@/lib/growth";

/** The loop's honest read of its own trajectory. */
export type LoopSignal =
  | "bootstrapping"
  | "improving"
  | "steady"
  | "churning"
  | "stuck";

/** What happened on the most recent loop run. */
export interface LoopThisRun {
  changesShipped: number | null;
  changesAbandoned: number | null;
  verifyCycleFailures: number | null;
  reviewRejections: number | null;
  circuitBreakerTrips: number | null;
}

/** Rolling 7-day loop metrics. */
export interface LoopRolling7d {
  mergedPrs: number | null;
  reverts: number | null;
  readinessAttempts: number | null;
  readinessRejected: number | null;
  /** The SAME wall hit across ≥2 runs — what the loop keeps failing on. */
  recurringFailures: string[];
  /** Open `loop: harness improvement proposal` issues. */
  harnessProposalsOpen: number | null;
}

export interface LoopHealth extends Availability {
  /** GitHub blob URL for the source file. */
  sourceUrl?: string;
  project?: string;
  asOf?: string;
  lastRun?: string | null;
  lastDeepAudit?: string | null;
  thisRun: LoopThisRun;
  rolling7d: LoopRolling7d;
  signal: LoopSignal | null;
}

const SIGNALS: LoopSignal[] = [
  "bootstrapping",
  "improving",
  "steady",
  "churning",
  "stuck",
];

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v)
    ? v
        .map((x) => (typeof x === "string" ? x.trim() : null))
        .filter((x): x is string => !!x)
    : [];
}

function blank(): Omit<LoopHealth, "available"> {
  return {
    thisRun: {
      changesShipped: null,
      changesAbandoned: null,
      verifyCycleFailures: null,
      reviewRejections: null,
      circuitBreakerTrips: null,
    },
    rolling7d: {
      mergedPrs: null,
      reverts: null,
      readinessAttempts: null,
      readinessRejected: null,
      recurringFailures: [],
      harnessProposalsOpen: null,
    },
    signal: null,
  };
}

/**
 * Parse docs/autonomous-loop/LOOP_HEALTH.md into a LoopHealth. Returns
 * `available: false` (with a reason + link) when the block is missing or
 * unparseable — never a fabricated value.
 */
export function parseLoopHealth(
  md: string | null | undefined,
  fileUrl?: string,
): LoopHealth {
  const unavailable = (reason: string): LoopHealth => ({
    ...blank(),
    available: false,
    reason,
    sourceUrl: fileUrl,
  });

  if (!md || !md.trim()) return unavailable("LOOP_HEALTH.md not found");
  const root = parseYamlBlock(md, "LOOP_HEALTH");
  if (!root) return unavailable("no LOOP_HEALTH block — see file");

  const tr = asObj(root.this_run);
  const r7 = asObj(root.rolling_7d);
  const signalStr = str(root.signal);

  return {
    available: true,
    sourceUrl: fileUrl,
    project: str(root.project) ?? undefined,
    asOf: str(root.as_of) ?? undefined,
    lastRun: str(root.last_run),
    lastDeepAudit: str(root.last_deep_audit),
    thisRun: {
      changesShipped: num(tr.changes_shipped),
      changesAbandoned: num(tr.changes_abandoned),
      verifyCycleFailures: num(tr.verify_cycle_failures),
      reviewRejections: num(tr.review_rejections),
      circuitBreakerTrips: num(tr.circuit_breaker_trips),
    },
    rolling7d: {
      mergedPrs: num(r7.merged_prs),
      reverts: num(r7.reverts),
      readinessAttempts: num(r7.readiness_attempts),
      readinessRejected: num(r7.readiness_rejected),
      recurringFailures: strArr(r7.recurring_failures),
      harnessProposalsOpen: num(r7.harness_proposals_open),
    },
    signal: SIGNALS.includes(signalStr as LoopSignal)
      ? (signalStr as LoopSignal)
      : null,
  };
}

/**
 * Does the loop need the owner? — it's stuck or churning, or it has filed a
 * harness proposal (the loop hit a wall it can't clear on its own). Drives the
 * "loop needs you" alert. Pure data; never fabricated.
 */
export function loopNeedsYou(lh: LoopHealth): boolean {
  if (!lh.available) return false;
  return (
    lh.signal === "stuck" ||
    lh.signal === "churning" ||
    (lh.rolling7d.harnessProposalsOpen ?? 0) > 0
  );
}

/**
 * The loop signal worth a chip on the dense Floor tile — anything past the
 * early "bootstrapping" state (which reads as "not reported yet"), so freshly
 * started loops don't clutter the fleet view with grey chips.
 */
export function floorLoopSignal(lh: LoopHealth): LoopSignal | null {
  const s = lh.signal;
  return s && s !== "bootstrapping" ? s : null;
}
