/**
 * The autonomous routine schedule — the dashboard's source of truth for
 * "when does each loop run next?".
 *
 * These are scheduled cloud Claude Code triggers. The repos' own docs proved
 * unreliable for cadence, so this mirrors the actual trigger schedule directly.
 * Every cron is standard 5-field, UTC. Update this block whenever the triggers
 * change; `AS_OF` records when it was last reconciled.
 *
 * (The live trigger API exposes a precise next_run_at — accurate to within a
 * couple of minutes of the cron slot — but computing from the crons below needs
 * no credentials and is plenty accurate for a "next run in ~3h" display.)
 *
 * Per project:
 *   - product_factory  — builds the product (every 8h, staggered per project;
 *                         LLM-Quant's is a Model Factory). Cadence reduced from
 *                         6h→8h on 2026-07-05 to hold weekly usage ≈85% of budget.
 *   - gtm_factory      — go-to-market growth engine (every 2 days; not LLM-Quant)
 *   - research         — research + alpha (daily; LLM-Quant only)
 *   - quality_auditor  — independent product-quality audit (every 2 days)
 *   - gtm_auditor      — independent GTM-quality audit (weekly, by weekday;
 *                         not LLM-Quant)
 * Plus one cross-project daily digest, currently disabled.
 *
 * "every 2 days" = a "0,2 day-of-month step" cron → odd calendar days
 * (1, 3, 5, … 31), ~48h with one short gap at the month rollover.
 */

export type RoutineType =
  | "product_factory"
  | "gtm_factory"
  | "research"
  | "quality_auditor"
  | "gtm_auditor"
  | "digest";

export interface Routine {
  /** Project slug this routine belongs to; null for cross-project (digests). */
  slug: string | null;
  /** Routine kind — drives the icon, label, and cadence legend. */
  type: RoutineType;
  /** Standard 5-field cron, UTC. */
  cron: string;
  /** False when the trigger is paused — no next run. */
  enabled: boolean;
}

/** When this schedule was last reconciled against the live triggers. */
export const ROUTINE_SCHEDULE_AS_OF = "2026-07-05";

/** The live schedule — 19 active routines + the disabled cross-project digest. */
export const ROUTINES: Routine[] = [
  // Product factories — every 6h, staggered one hour apart.
  { slug: "aptdesignerai", type: "product_factory", cron: "11 0,8,16 * * *", enabled: true },
  { slug: "highlightmagic", type: "product_factory", cron: "51 2,10,18 * * *", enabled: true },
  { slug: "grocerymanager", type: "product_factory", cron: "31 1,9,17 * * *", enabled: true },
  { slug: "jobscraper", type: "product_factory", cron: "11 4,12,20 * * *", enabled: true },
  { slug: "llm-quant", type: "product_factory", cron: "31 5,13,21 * * *", enabled: true }, // Model Factory
  // GTM factories — every 2 days (odd calendar days), staggered.
  { slug: "aptdesignerai", type: "gtm_factory", cron: "0 5 */2 * *", enabled: true },
  { slug: "highlightmagic", type: "gtm_factory", cron: "0 11 */2 * *", enabled: true },
  { slug: "grocerymanager", type: "gtm_factory", cron: "0 17 */2 * *", enabled: true },
  { slug: "jobscraper", type: "gtm_factory", cron: "0 23 */2 * *", enabled: true },
  // Research + alpha — daily (LLM-Quant only).
  { slug: "llm-quant", type: "research", cron: "30 13 * * *", enabled: true },
  // Quality auditors — every 2 days (odd days), staggered.
  { slug: "highlightmagic", type: "quality_auditor", cron: "30 1 */2 * *", enabled: true },
  { slug: "aptdesignerai", type: "quality_auditor", cron: "30 9 */2 * *", enabled: true },
  { slug: "grocerymanager", type: "quality_auditor", cron: "30 15 */2 * *", enabled: true },
  { slug: "jobscraper", type: "quality_auditor", cron: "30 19 */2 * *", enabled: true },
  { slug: "llm-quant", type: "quality_auditor", cron: "30 21 */2 * *", enabled: true },
  // GTM auditors — weekly on a named weekday (Mon/Tue/Wed/Thu).
  { slug: "aptdesignerai", type: "gtm_auditor", cron: "30 3 * * 1", enabled: true },
  { slug: "highlightmagic", type: "gtm_auditor", cron: "30 7 * * 2", enabled: true },
  { slug: "grocerymanager", type: "gtm_auditor", cron: "30 12 * * 3", enabled: true },
  { slug: "jobscraper", type: "gtm_auditor", cron: "30 18 * * 4", enabled: true },
  // Cross-project daily digest — currently paused.
  { slug: null, type: "digest", cron: "0 13 * * *", enabled: false },
];

/** Display order within a project. */
const TYPE_ORDER: Record<RoutineType, number> = {
  product_factory: 0,
  gtm_factory: 1,
  research: 1,
  quality_auditor: 2,
  gtm_auditor: 3,
  digest: 4,
};

/** Short label for the dense Floor tile (e.g. "next factory in 3h"). */
const SHORT_LABEL: Record<RoutineType, string> = {
  product_factory: "factory",
  gtm_factory: "GTM run",
  research: "research",
  quality_auditor: "quality audit",
  gtm_auditor: "GTM audit",
  digest: "digest",
};

/** The routines for one project, in display order. */
export function routinesForSlug(slug: string): Routine[] {
  return ROUTINES.filter((r) => r.slug === slug).sort(
    (a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type],
  );
}

/** Cross-project routines (not tied to a single project) — e.g. the digest. */
export function crossProjectRoutines(): Routine[] {
  return ROUTINES.filter((r) => r.slug === null);
}

/** Short, lowercase routine label for compact contexts (the Floor tile). */
export function routineShortLabel(type: RoutineType): string {
  return SHORT_LABEL[type];
}
