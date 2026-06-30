/**
 * Cost visibility, from data already in the repos.
 *
 * Two honest signals — never a fabricated per-routine token bill:
 *
 * 1. Product inference cost — each app meters its OWN runtime LLM spend
 *    (cost-meter / withCostLedger + recordUsage in the observability layer). That
 *    output lives in runtime telemetry exposed via the owner metrics API, so it's
 *    only dashboard-readable if a repo PUBLISHES it as a `cost` block in
 *    GROWTH_STATUS. The agents CANNOT publish it themselves (the metrics API needs
 *    a token, and secrets never live in agents); it populates only when the owner
 *    wires a token-holding job post-launch. So the empty state is the correct
 *    STEADY STATE pre-launch — not a gap to nag about.
 *
 *    The `cost` block schema we parse (so the eventual publisher matches exactly):
 *
 *      cost:                 # app runtime LLM inference spend; null/0 pre-launch
 *        as_of: <date>
 *        currency: USD
 *        window_days: 7
 *        total_usd: <number|null>
 *        by_model: { <model-id>: <usd> }   # real model ids (gemini-2.5-flash-lite,
 *                                           # claude-opus-4-8) — the parser handles dots
 *        by_stage: { <stage>: <usd> }
 *        source: "in-app cost-meter (withCostLedger); live figure via owner-only metrics API"
 *
 * 2. Activity-as-cost proxy (rendered in the UI) — scheduled runs/week and the
 *    reverts that reveal wasted compute. A within-product signal, never a dollar.
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
  /** Currency code from the block (defaults to USD). */
  currency: string;
  /** Total metered app LLM spend over the window. */
  totalUsd: number | null;
  /** The window the figure covers, in days. */
  windowDays: number | null;
  /** Spend split by model, when reported. */
  byModel: CostLine[];
  /** Spend split by pipeline stage, when reported. */
  byStage: CostLine[];
  /** Provenance string from the block (where the figure comes from), when given. */
  source?: string;
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
 * metrics API; the empty state is the expected pre-launch steady state). Tolerant
 * of any field subset; never fabricates a number. `total_usd` is the canonical
 * total (older `inference_usd` / `usd` keys are accepted as lenient fallbacks).
 */
export function parseProductCost(
  md: string | null | undefined,
  fileUrl?: string,
): ProductInferenceCost {
  const blank: ProductInferenceCost = {
    available: false,
    sourceUrl: fileUrl,
    currency: "USD",
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
  const totalUsd = num(cost.total_usd) ?? num(cost.inference_usd) ?? num(cost.usd);
  const byModel = lines(cost.by_model);
  const byStage = lines(cost.by_stage);
  if (totalUsd === null && byModel.length === 0 && byStage.length === 0) {
    return { ...blank, reason: "cost block present, no spend yet — pre-launch (no users)" };
  }
  return {
    available: true,
    sourceUrl: fileUrl,
    asOf: str(cost.as_of) ?? undefined,
    currency: str(cost.currency) ?? "USD",
    totalUsd,
    windowDays: num(cost.window_days) ?? num(cost.window_d),
    byModel,
    byStage,
    source: str(cost.source) ?? undefined,
  };
}
