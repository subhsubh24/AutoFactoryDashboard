/**
 * GTM channel approvals (GTM_STANDARD §9).
 *
 * The GTM factory proposes a new channel / paid campaign by writing a
 * `pending_approvals[]` block into docs/growth/GROWTH_STATUS.md. Each proposal is
 * an OWNER DECISION, surfaced with its full economics (shown AS-IS — these are
 * projections, never presented as measured) and gated behind a matching
 * `gtm-approve-<channel>` OWNER_ACTION. The owner approves by writing an
 * `approved_channels:` record into PENDING_OPS.md — the dashboard only READS both
 * feeds; it never writes an approval.
 *
 * Pre-launch the normal state is empty (no proposals, no approved channels), so
 * both parsers return [] and the UI renders nothing.
 *
 * Shapes parsed (tolerant of field-name variants; never fabricated):
 *
 *   # docs/growth/GROWTH_STATUS.md (nested under GROWTH_STATUS:, or standalone)
 *   pending_approvals:
 *     - channel: reddit-ads
 *       thesis: "Devs cluster in r/webdev; promoted posts can reach them cheaply."
 *       monthly_cap_usd: 500
 *       test_budget_usd: 150
 *       cac_usd: 28
 *       payback_months: 4
 *       ltv_cac_ratio: 3.2
 *       assumptions: ["projected — no live data", "LTV from comparable SaaS"]
 *       test: "Spend $150 over 2 weeks; >=15 signups at <=$30 CAC to proceed."
 *       kill_criteria: "CAC > $45 after $150 spend, or < 8 signups."
 *       action_id: gtm-approve-reddit-ads   # optional; else derived from channel
 *
 *   # PENDING_OPS.md
 *   approved_channels:
 *     - channel: reddit-ads
 *       cap_usd: 500
 *       approved_on: 2026-07-01
 *       spent_usd: 120          # reported by the factory once live
 *       results_vs_plan: "12 signups at $10 CAC — ahead of plan."
 */
import { parseYamlBlock, parseYamlBlockValue } from "@/lib/growth";

/** Projected unit economics for a proposed channel (assumptions surfaced as-is). */
export interface ApprovalEconomics {
  cacUsd: number | null;
  paybackMonths: number | null;
  ltvCacRatio: number | null;
  /** Assumption flags shown verbatim — these are projections, not measured. */
  assumptions: string[];
}

/** A GTM factory proposal awaiting the owner's approve/reject decision. */
export interface PendingApproval {
  channel: string;
  thesis: string | null;
  monthlyCapUsd: number | null;
  testBudgetUsd: number | null;
  economics: ApprovalEconomics;
  /** The falsifiable test that would prove the channel out. */
  test: string | null;
  /** The kill criteria that would shut it down. */
  killCriteria: string | null;
  /** Owner-action id that records approval, e.g. "gtm-approve-reddit-ads". */
  actionId: string;
}

/** An owner-approved channel, from PENDING_OPS' `approved_channels:` record. */
export interface ApprovedChannel {
  channel: string;
  capUsd: number | null;
  approvedOn: string | null;
  /** Live spend, once the factory reports it. */
  spentUsd: number | null;
  /** Results-vs-plan note, once the factory reports it. */
  resultsVsPlan: string | null;
}

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
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "string" ? x.trim() : null)).filter((x): x is string => !!x);
  }
  const s = str(v);
  return s ? [s] : [];
}
/** channel name → url-safe slug for the derived owner-action id. */
function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Parse `pending_approvals[]` from GROWTH_STATUS.md (nested under the
 * GROWTH_STATUS block, or a standalone fenced block). Skips entries with no
 * channel; never fabricates economics. [] when absent (the pre-launch norm).
 */
export function parsePendingApprovals(md: string | null | undefined): PendingApproval[] {
  const root = parseYamlBlock(md, "GROWTH_STATUS");
  const nested = root ? root.pending_approvals : null;
  const raw = Array.isArray(nested) ? nested : parseYamlBlockValue(md, "pending_approvals");
  const list = Array.isArray(raw) ? raw : [];

  const out: PendingApproval[] = [];
  for (const entry of list) {
    const o = asObj(entry);
    const channel = str(o.channel) ?? str(o.name);
    if (!channel) continue;
    out.push({
      channel,
      thesis: str(o.thesis) ?? str(o.rationale) ?? str(o.why),
      monthlyCapUsd:
        num(o.monthly_cap_usd) ??
        num(o.monthly_budget_cap_usd) ??
        num(o.budget_cap_usd) ??
        num(o.cap_usd),
      testBudgetUsd: num(o.test_budget_usd) ?? num(o.test_budget),
      economics: {
        cacUsd: num(o.cac_usd) ?? num(o.expected_cac_usd) ?? num(o.cac),
        paybackMonths: num(o.payback_months) ?? num(o.payback),
        ltvCacRatio: num(o.ltv_cac_ratio) ?? num(o.ltv_cac) ?? num(o.ltv_to_cac),
        assumptions: strArr(o.assumptions),
      },
      test: str(o.test) ?? str(o.falsifiable_test) ?? str(o.hypothesis_test),
      killCriteria: str(o.kill_criteria) ?? str(o.kill) ?? str(o.kill_switch),
      actionId: str(o.action_id) ?? `gtm-approve-${slug(channel)}`,
    });
  }
  return out;
}

/**
 * Parse `approved_channels:` from PENDING_OPS.md — the owner's recorded decision
 * (plus live spend / results once the factory reports them). [] when absent.
 */
export function parseApprovedChannels(md: string | null | undefined): ApprovedChannel[] {
  const raw = parseYamlBlockValue(md, "approved_channels");
  const list = Array.isArray(raw) ? raw : [];

  const out: ApprovedChannel[] = [];
  for (const entry of list) {
    const o = asObj(entry);
    const channel = str(o.channel) ?? str(o.name);
    if (!channel) continue;
    out.push({
      channel,
      capUsd: num(o.cap_usd) ?? num(o.monthly_cap_usd) ?? num(o.cap),
      approvedOn: str(o.approved_on) ?? str(o.approved) ?? str(o.date),
      spentUsd: num(o.spent_usd) ?? num(o.spend_usd) ?? num(o.spent),
      resultsVsPlan: str(o.results_vs_plan) ?? str(o.results) ?? str(o.results_note),
    });
  }
  return out;
}
