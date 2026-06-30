import type { Grade, QualityScorecard } from "@/lib/scorecard";
import type { AttentionIssue } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckIcon, ExternalLinkIcon } from "@/components/icons";

/** Grade → badge colours. null (ungraded) reads quiet, never as a failure. */
function gradeClasses(grade: Grade | null): string {
  if (grade === null) return "bg-bg text-muted";
  if (grade === "A+" || grade === "A") return "bg-sage-soft text-sage-strong";
  if (grade === "B" || grade === "C") return "bg-amber-soft text-amber-strong";
  return "bg-clay-soft text-clay-strong"; // D / F
}

function GradeBadge({ grade }: { grade: Grade | null }) {
  return (
    <span
      className={cn(
        "inline-grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-semibold tabular",
        gradeClasses(grade),
      )}
    >
      {grade ?? "—"}
    </span>
  );
}

/**
 * The auditor's filed gap issues (`quality:` / `gtm-quality:` GitHub issues) —
 * the tracked work to drive a grade up. The prefix is stripped for display since
 * the section label already says which auditor. Empty → renders nothing.
 */
export function AuditorGaps({
  issues,
  label,
}: {
  issues: AttentionIssue[];
  label: string;
}) {
  if (issues.length === 0) return null;
  return (
    <div className="mt-3 border-t border-hairline pt-3">
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
        {label} ({issues.length})
      </p>
      <ul className="space-y-1.5">
        {issues.map((i) => (
          <li key={i.number}>
            <a
              href={i.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-2 text-xs text-ink transition-colors hover:text-clay"
            >
              <span className="shrink-0 tabular text-muted">#{i.number}</span>
              <span className="line-clamp-2">
                {i.title.replace(/^\s*(?:gtm-)?quality\s*:\s*/i, "")}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function shortDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * The independent quality scorecard (docs/quality/QUALITY_SCORECARD.md): a
 * per-dimension A+→F grid, the overall grade, and the ship gate (met only when
 * every ship-critical dimension is A/A+). Grades stay null until the auditor's
 * first run — rendered "not graded yet", never a fabricated grade.
 */
export function QualityScorecardView({
  scorecard,
  fileLabel = "QUALITY_SCORECARD.md",
}: {
  scorecard: QualityScorecard;
  /** Source-link label — e.g. "GTM_SCORECARD.md" for the GTM auditor. */
  fileLabel?: string;
}) {
  const s = scorecard;
  const asOf = shortDate(s.asOf);
  const anyGraded = s.dimensions.some((d) => d.grade !== null) || s.overall !== null;

  return (
    <div className="space-y-4">
      {/* Overall + ship gate. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2.5">
          <GradeBadge grade={s.overall} />
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
              Overall
            </p>
            <p className="text-sm font-medium text-ink">
              {s.overall ?? "Not graded yet"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              s.shipGateMet === true
                ? "bg-sage-soft text-sage-strong"
                : "bg-bg text-muted",
            )}
          >
            {s.shipGateMet === true && <CheckIcon className="h-3 w-3" />}
            Ship gate {s.shipGateMet === true ? "met" : s.shipGateMet === false ? "not met" : "—"}
          </span>
        </div>
        {asOf && (
          <span className="ml-auto text-xs text-muted">
            graded {asOf}
            {s.gradedBy ? ` · ${s.gradedBy}` : ""}
          </span>
        )}
      </div>

      {!anyGraded && (
        <p className="text-xs text-muted">
          The independent auditor hasn&apos;t graded a dimension yet — grades fill
          in on its first run. (Dimensions and the ship gate are listed below.)
        </p>
      )}

      {/* Per-dimension grid. A ship-critical dim below the A bar is flagged red. */}
      <ul className="divide-y divide-hairline">
        {s.dimensions.map((d) => {
          const belowBar =
            d.shipCritical && d.grade !== null && d.grade !== "A" && d.grade !== "A+";
          return (
            <li
              key={d.key}
              className={cn(
                "flex items-center gap-3 py-2",
                belowBar && "-mx-2 rounded-lg bg-clay-soft/40 px-2",
              )}
            >
              <GradeBadge grade={d.grade} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                  {d.label}
                  {d.shipCritical && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium",
                        belowBar ? "bg-clay-soft text-clay-strong" : "bg-bg text-muted",
                      )}
                    >
                      {belowBar ? "ship-critical · below A" : "ship-critical"}
                    </span>
                  )}
                </p>
                {d.gap && <p className="mt-0.5 text-xs leading-snug text-muted">{d.gap}</p>}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Ordered top gaps — the work to drive grades up. */}
      {s.topGaps.length > 0 && (
        <div className="border-t border-hairline pt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
            Top gaps
          </p>
          <ol className="space-y-1.5">
            {s.topGaps.map((g, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-snug text-ink">
                <span className="mt-0.5 shrink-0 tabular text-muted">{i + 1}.</span>
                <span>
                  {g.dimension && (
                    <span className="font-medium text-ink">{g.dimension}: </span>
                  )}
                  {g.gap}
                  {g.severity && <span className="text-muted"> ({g.severity})</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {s.sourceUrl && (
        <a
          href={s.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-clay"
        >
          QUALITY_SCORECARD.md <ExternalLinkIcon className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
