/**
 * The autonomous routine schedule — the dashboard's source of truth for
 * "when does each loop run next?".
 *
 * These are scheduled cloud Claude Code triggers. The repos' own docs proved
 * unreliable for cadence (a stale README can lag the live trigger by hours), so
 * this mirrors the actual trigger schedule directly. Every cron is standard
 * 5-field, UTC. Update this block whenever the triggers change; `AS_OF` records
 * when it was last reconciled.
 *
 * (The live trigger API exposes a precise next_run_at — accurate to within a
 * couple of minutes of the cron slot — but computing from the crons below needs
 * no credentials and is plenty accurate for a "next run in ~3h" display.)
 *
 * Each project runs three routines:
 *   - factory          — builds the product (every 6h, staggered per project)
 *   - growth / research — daily growth & marketing (research, for the quant)
 *   - auditor          — independent deep audit (every other day, odd calendar days)
 * Plus one cross-project daily digest, currently disabled.
 */

export type RoutineType = "factory" | "growth" | "research" | "auditor" | "digest";

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
export const ROUTINE_SCHEDULE_AS_OF = "2026-06-28";

/**
 * The live schedule. Factories are staggered an hour apart so they never fire
 * at once; auditors run on odd calendar days (the "every other day" step).
 */
export const ROUTINES: Routine[] = [
  // Factories — every 6h, staggered.
  { slug: "aptdesignerai", type: "factory", cron: "0 0,6,12,18 * * *", enabled: true },
  { slug: "highlightmagic", type: "factory", cron: "0 1,7,13,19 * * *", enabled: true },
  { slug: "grocerymanager", type: "factory", cron: "0 2,8,14,20 * * *", enabled: true },
  { slug: "jobscraper", type: "factory", cron: "0 3,9,15,21 * * *", enabled: true },
  { slug: "llm-quant", type: "factory", cron: "0 4,10,16,22 * * *", enabled: true },
  // Growth / research — once a day.
  { slug: "aptdesignerai", type: "growth", cron: "0 5 * * *", enabled: true },
  { slug: "highlightmagic", type: "growth", cron: "0 11 * * *", enabled: true },
  { slug: "llm-quant", type: "research", cron: "30 13 * * *", enabled: true },
  { slug: "grocerymanager", type: "growth", cron: "0 17 * * *", enabled: true },
  { slug: "jobscraper", type: "growth", cron: "0 23 * * *", enabled: true },
  // Auditors — every other day (odd calendar days), staggered.
  { slug: "highlightmagic", type: "auditor", cron: "30 1 */2 * *", enabled: true },
  { slug: "aptdesignerai", type: "auditor", cron: "30 9 */2 * *", enabled: true },
  { slug: "grocerymanager", type: "auditor", cron: "30 15 */2 * *", enabled: true },
  { slug: "jobscraper", type: "auditor", cron: "30 19 */2 * *", enabled: true },
  { slug: "llm-quant", type: "auditor", cron: "30 21 */2 * *", enabled: true },
  // Cross-project daily digest — currently paused.
  { slug: null, type: "digest", cron: "0 13 * * *", enabled: false },
];

/** Display order within a project: factory → growth/research → auditor. */
const TYPE_ORDER: Record<RoutineType, number> = {
  factory: 0,
  growth: 1,
  research: 1,
  auditor: 2,
  digest: 3,
};

/** The routines for one project, ordered factory → growth/research → auditor. */
export function routinesForSlug(slug: string): Routine[] {
  return ROUTINES.filter((r) => r.slug === slug).sort(
    (a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type],
  );
}

/** Cross-project routines (not tied to a single project) — e.g. the digest. */
export function crossProjectRoutines(): Routine[] {
  return ROUTINES.filter((r) => r.slug === null);
}
