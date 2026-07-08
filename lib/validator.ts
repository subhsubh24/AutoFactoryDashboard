/**
 * docs/autonomous-loop/VALIDATOR_STATUS.md → ValidatorStatus.
 *
 * The computer-use validator (FACTORY_STANDARD §29) drives the DEPLOYED app
 * through real user flows like a human, then writes its last-sweep result to a
 * fenced VALIDATOR_STATUS block. We surface pass/total, open findings, and the
 * specific flows that failed (each optionally linked to the issue it filed).
 * REAL data only: a missing or unparseable block degrades to `available: false`,
 * never a guessed "all green".
 */
import type { Availability } from "@/lib/types";
import { parseYamlBlock } from "@/lib/growth";
import { safeHttpUrl } from "@/lib/utils";

export type FlowStatus = "pass" | "fail" | "skipped";
export type FindingSeverity = "high" | "med" | "low";

/** A single flow the validator exercised on the live app. */
export interface ValidatorFinding {
  flow: string;
  status: FlowStatus | null;
  severity: FindingSeverity | null;
  note: string | null;
  issueUrl: string | null;
}

export interface ValidatorStatus extends Availability {
  /** GitHub blob URL for the source file. */
  sourceUrl?: string;
  project?: string;
  asOf?: string;
  lastSweep?: string | null;
  targetUrl?: string | null;
  flowsTotal: number | null;
  flowsPassed: number | null;
  flowsFailed: number | null;
  openFindings: number | null;
  findings: ValidatorFinding[];
}

const FLOW_STATUSES: FlowStatus[] = ["pass", "fail", "skipped"];
const SEVERITIES: FindingSeverity[] = ["high", "med", "low"];

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

function blank(): Omit<ValidatorStatus, "available"> {
  return {
    flowsTotal: null,
    flowsPassed: null,
    flowsFailed: null,
    openFindings: null,
    findings: [],
  };
}

function parseFindings(v: unknown): ValidatorFinding[] {
  if (!Array.isArray(v)) return [];
  const out: ValidatorFinding[] = [];
  for (const raw of v) {
    const o = asObj(raw);
    const flow = str(o.flow);
    if (!flow) continue;
    const status = str(o.status);
    const severity = str(o.severity);
    out.push({
      flow,
      status: FLOW_STATUSES.includes(status as FlowStatus)
        ? (status as FlowStatus)
        : null,
      severity: SEVERITIES.includes(severity as FindingSeverity)
        ? (severity as FindingSeverity)
        : null,
      note: str(o.note),
      issueUrl: safeHttpUrl(str(o.issue_url)) ?? null,
    });
  }
  return out;
}

/**
 * Parse docs/autonomous-loop/VALIDATOR_STATUS.md into a ValidatorStatus. Returns
 * `available: false` (with a reason + link) when the block is missing or
 * unparseable — never a fabricated "all passing".
 */
export function parseValidatorStatus(
  md: string | null | undefined,
  fileUrl?: string,
): ValidatorStatus {
  const unavailable = (reason: string): ValidatorStatus => ({
    ...blank(),
    available: false,
    reason,
    sourceUrl: fileUrl,
  });

  if (!md || !md.trim()) return unavailable("no validator sweep reported yet");
  const root = parseYamlBlock(md, "VALIDATOR_STATUS");
  if (!root) return unavailable("no VALIDATOR_STATUS block — see file");

  return {
    available: true,
    sourceUrl: fileUrl,
    project: str(root.project) ?? undefined,
    asOf: str(root.as_of) ?? undefined,
    lastSweep: str(root.last_sweep),
    targetUrl: str(root.target_url),
    flowsTotal: num(root.flows_total),
    flowsPassed: num(root.flows_passed),
    flowsFailed: num(root.flows_failed),
    openFindings: num(root.open_findings),
    findings: parseFindings(root.findings),
  };
}
