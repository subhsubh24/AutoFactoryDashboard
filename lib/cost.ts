/**
 * Cost visibility, from data already in the repos.
 *
 * Two honest signals — never a fabricated per-routine token bill:
 *
 * 1. Product inference cost — each app meters its OWN runtime LLM spend
 *    (cost-meter / withCostLedger + recordUsage in the observability layer). That
 *    output lives in runtime telemetry exposed via the owner metrics API, so it's
 *    only dashboard-readable if a repo PUBLISHES it as a `cost` block in
 *    GROWTH_STATUS. We parse that block when present; otherwise we say so plainly.
 *
 * 2. Activity-as-cost proxy — runs/week (from the trigger schedule) × merged PRs ×
 *    reverts (from LOOP_HEALTH / gh). A rough "which products are working hardest",
 *    computed in the UI from feeds we already read. A proxy, never a dollar figure.
 *
 * What we CANNOT show: true per-routine claude.ai token spend — that's owner-only
 * platform billing (the claude.ai usage page), not in any repo. Labeled as such.
 */
import type { Availability } from "@/lib/types";
import { parseYamlBlock } from "@/lib/growth";

/** One labelled cost line (a model or a pipeline stage). */
export interface CostLine {
  label: string;
  usd: number;
}

export interface ProductInferenceCost extends Availability {
  sourceUrl?: string;
  asOf?: string;
  /** Total metered app LLM spend over the window. */
  totalUsd: number | null;
  /** The window the figure covers, in days. */
  windowDays: number | null;
  /** Spend split by model, when reported. */
  byModel: CostLine[];
  /** Spend split by pipeline stage, when reported. */
  byStage: CostLine[];
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
/** A map of {label: usd} → sorted, highest-spend-first cost lines. */
function lines(v: unknown): CostLine[] {
  const o = asObj(v);
  return Object.keys(o)
    .map((label) => ({ label, usd: num(o[label]) ?? 0 }))
    .filter((l) => l.usd > 0)
    .sort((a, b) => b.usd - a.usd);
}

/**
 * Parse the optional `cost` block of GROWTH_STATUS.md into product inference cost.
 * Absent block → `available: false` (the live figure lives behind the owner
 * metrics API). Tolerant of any field subset; never fabricates a number.
 */
export function parseProductCost(
  md: string | null | undefined,
  fileUrl?: string,
): ProductInferenceCost {
  const blank: ProductInferenceCost = {
    available: false,
    sourceUrl: fileUrl,
    totalUsd: null,
    windowDays: null,
    byModel: [],
    byStage: [],
  };
  const root = parseYamlBlock(md, "GROWTH_STATUS");
  const cost = root ? asObj(root.cost) : null;
  if (!cost || Object.keys(cost).length === 0) {
    return { ...blank, reason: "no cost block — metered in-app, owner-only via metrics API" };
  }
  const totalUsd = num(cost.inference_usd) ?? num(cost.total_usd) ?? num(cost.usd);
  const byModel = lines(cost.by_model);
  const byStage = lines(cost.by_stage);
  if (totalUsd === null && byModel.length === 0 && byStage.length === 0) {
    return { ...blank, reason: "cost block present but no spend reported yet" };
  }
  return {
    available: true,
    sourceUrl: fileUrl,
    asOf: str(cost.as_of) ?? undefined,
    totalUsd,
    windowDays: num(cost.window_days) ?? num(cost.window_d),
    byModel,
    byStage,
  };
}
