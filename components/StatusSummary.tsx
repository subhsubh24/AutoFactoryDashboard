import type { ProjectSnapshot } from "@/lib/types";
import type { RoutineRun } from "@/lib/routine";
import { attentionReason, humanAsksFor } from "@/lib/aggregate";
import { cn, statusMeta, toneClasses } from "@/lib/utils";
import { routineShortLabel } from "@/config/routines";
import { NextRun } from "@/components/NextRun";

/**
 * The project TL;DR — three lines that answer the only questions worth a glance:
 * where it is now, what happens next, and what (if anything) it needs from you.
 * Assembled from real fields only — status + the two progress axes, the loop's
 * own next unchecked task, the scheduled run, and the live asks. No prose
 * synthesis, nothing fabricated; everything below on the page is the detail
 * behind these three lines.
 */
export function StatusSummary({
  snapshot: s,
  soonest,
}: {
  snapshot: ProjectSnapshot;
  soonest: RoutineRun | null;
}) {
  // A plain state word for the NOW row — deliberately NOT statusMeta's label,
  // which says "Needs you" for blocked and would then echo the YOU row.
  const tone = statusMeta(s.status).tone;
  const stateLabel =
    s.status === "ready"
      ? "Ready to ship"
      : s.status === "building"
        ? "In progress"
        : s.status === "blocked"
          ? "Blocked"
          : "Idle";
  const needs = attentionReason(humanAsksFor(s), s.stuckPRs);
  const nextItem = s.progress.nextItem;

  // NOW — the two progress axes (whichever are measured).
  const now: string[] = [];
  if (s.progress.buildPct !== null) now.push(`${s.progress.buildPct}% built`);
  if (s.progress.percentToSubmission !== null)
    now.push(`${s.progress.percentToSubmission}% to submission`);
  const loopStuck =
    s.loopHealth.available &&
    (s.loopHealth.signal === "stuck" || s.loopHealth.signal === "churning")
      ? s.loopHealth.signal
      : null;

  const runLabel = soonest?.nextAt ? (
    <>
      {routineShortLabel(soonest.routine.type)} run{" "}
      <NextRun at={soonest.nextAt} cron={soonest.routine.cron} />
    </>
  ) : null;

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-hairline bg-card">
      <dl className="divide-y divide-hairline">
        <Row label="Now">
          <span className={cn("font-medium", toneClasses(tone).text)}>
            {stateLabel}
          </span>
          {now.length > 0 && <span className="text-muted"> · {now.join(" · ")}</span>}
          {loopStuck && <span className="text-clay-strong"> · loop {loopStuck}</span>}
        </Row>

        <Row label="Next">
          {nextItem ? (
            <>
              <span className="text-ink">{nextItem}</span>
              {runLabel && <span className="text-muted"> · {runLabel}</span>}
            </>
          ) : runLabel ? (
            <span className="text-ink">Next {runLabel}</span>
          ) : (
            <span className="text-muted">On its regular schedule.</span>
          )}
        </Row>

        <Row label="You">
          {needs ? (
            <>
              <span className="font-medium text-clay-strong">{needs}</span>
              <span className="text-muted"> — see Action plan below</span>
            </>
          ) : (
            <span className="text-muted">
              Nothing right now — the loop is running on its own.
            </span>
          )}
        </Row>
      </dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-5 py-3">
      <dt className="w-12 shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-sm leading-snug text-ink">{children}</dd>
    </div>
  );
}
