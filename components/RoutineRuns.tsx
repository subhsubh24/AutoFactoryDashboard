import type { ProjectSnapshot } from "@/lib/types";
import type { Narrative, GrowthSummary } from "@/lib/narrative";
import type { QualityScorecard } from "@/lib/scorecard";
import type { RoutineType } from "@/config/routines";
import { routinesForSlug } from "@/config/routines";
import { cn, firstSentence, formatShortDate, toneClasses, type Tone } from "@/lib/utils";

/**
 * "What each routine last did" — one line per scheduled routine that touches a
 * project (product factory, GTM factory, the two independent auditors, research).
 * An at-a-glance overview that sits above the detailed sections; the run/GTM
 * lines reuse the AI summaries shown in full below, and the auditor lines are
 * the auditor's own structured grade (never AI'd, never fabricated).
 */
export interface RoutineRunSummary {
  type: RoutineType;
  label: string;
  /** ISO / date-ish string of the last run; null when unknown. */
  when: string | null;
  /** One-line summary of what that run did / produced. */
  line: string;
  /** Auditor grade (A+→F), when this routine is an auditor. */
  grade?: string | null;
  gradeTone?: Tone;
  /** Provenance of `line` — AI (llm/template) vs the auditor's structured grade. */
  source?: "llm" | "template" | "structured";
}

const GRADE_TONE: Record<string, Tone> = {
  "A+": "sage",
  A: "sage",
  B: "sage",
  C: "amber",
  D: "clay",
  F: "clay",
};

function scorecardRow(
  type: RoutineType,
  label: string,
  sc: QualityScorecard,
  /** Plain-language AI read of the gaps; falls back to the raw top gap. */
  plain?: string | null,
): RoutineRunSummary {
  const graded = sc.available && !!sc.overall;
  const top = sc.topGaps[0];
  // Prefer the plain-language AI read; else the auditor's own top gap verbatim.
  const line = !graded
    ? "Not graded yet"
    : plain
      ? plain
      : top
        ? `${firstSentence(top.gap, 400)}${
            sc.topGaps.length > 1 ? ` (+${sc.topGaps.length - 1} more)` : ""
          }`
        : "No open gaps";
  return {
    type,
    label,
    when: sc.available ? sc.asOf ?? null : null,
    grade: graded ? sc.overall : null,
    gradeTone: graded ? GRADE_TONE[sc.overall!] ?? "muted" : "muted",
    line,
    source: graded && plain ? "llm" : "structured",
  };
}

/** Assemble the "last run of each routine" list for a project. */
export function buildRoutineRunSummaries(
  s: ProjectSnapshot,
  narrative: Narrative,
  growth: GrowthSummary,
  /** Plain-language AI summaries of the auditor gaps (project page only). */
  audits?: { quality?: string | null; gtm?: string | null },
): RoutineRunSummary[] {
  const isModel = s.slug === "llm-quant";
  const lastShip = s.recentMerged[0]?.mergedAt ?? null;
  const productWhen = s.loopHealth.lastRun ?? lastShip;
  const g = s.growth;

  return routinesForSlug(s.slug)
    .filter((r) => r.type !== "digest")
    .map((r): RoutineRunSummary => {
      switch (r.type) {
        case "product_factory":
          return {
            type: r.type,
            label: isModel ? "Model factory" : "Product factory",
            when: productWhen,
            // The actual AI run summary (what it did), not just the headline.
            line: narrative.text
              ? narrative.text
              : narrative.headline || "No recent run reported.",
            source: narrative.source,
          };
        case "gtm_factory":
          return {
            type: r.type,
            label: "GTM factory",
            when: g.available ? g.asOf ?? null : null,
            line: growth.overall || "No growth run reported yet.",
            source: growth.source,
          };
        case "research":
          return {
            type: r.type,
            label: "Research",
            when: productWhen,
            // Prefer the go-live signal (research's own output); else the AI run digest.
            line: g.goLive?.status
              ? `Go-live: ${g.goLive.status.replace(/_/g, " ")}` +
                (g.goLive.confidence ? ` (${g.goLive.confidence} confidence)` : "")
              : narrative.text
                ? narrative.text
                : "No recent run reported.",
            source: g.goLive?.status ? "structured" : narrative.source,
          };
        case "quality_auditor":
          return scorecardRow(r.type, "Quality audit", s.qualityScorecard, audits?.quality);
        case "gtm_auditor":
          return scorecardRow(r.type, "GTM audit", s.gtmScorecard, audits?.gtm);
        default:
          return { type: r.type, label: r.type, when: null, line: "" };
      }
    })
    .filter((row) => row.line || row.grade);
}

function whenLabel(when: string | null): string | null {
  if (!when) return null;
  return formatShortDate(when) ?? when;
}

export function RoutineRuns({ runs }: { runs: RoutineRunSummary[] }) {
  if (runs.length === 0) return null;
  return (
    <ul className="divide-y divide-hairline">
      {runs.map((r) => {
        const when = whenLabel(r.when);
        return (
          <li key={r.type} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[13px] font-medium text-ink">{r.label}</span>
                {when && (
                  <span className="text-[11px] text-muted">
                    <span aria-hidden>· </span>
                    {when}
                  </span>
                )}
                {r.grade && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      toneClasses(r.gradeTone ?? "muted").badge,
                    )}
                  >
                    {r.grade}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm leading-snug text-muted">{r.line}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
