import { RelativeTime } from "@/components/RelativeTime";
import { NextRun } from "@/components/NextRun";
import { ClockIcon, RocketIcon, SparkleIcon } from "@/components/icons";

/**
 * "Last run → next run" pulse — the heartbeat line under the 24-hour summary.
 * Left: the single most recent thing that shipped (any project / routine) — the
 * actual PR title (what that last run did), which project it was, and how long
 * ago. Deliberately NOT a 24-hour digest: it answers "what just happened", one
 * run, one line. Right: the very next routine scheduled to fire, with its local
 * slot + a live countdown. Used fleet-wide on the Floor and per-project on a
 * detail page.
 */

export interface RunPulseLast {
  /** What the last run did — an AI summary read from the full PR (falls back to
   *  the PR title). */
  summary: string;
  /** Link to that PR. */
  href?: string;
  /** When it merged — drives the live "x ago". */
  when: string | null;
  /** Which line shipped it (fleet view only; omitted on a project's own page). */
  project?: string;
  /** Provenance of `summary` — an honest AI/Template marker. */
  source?: "llm" | "template" | null;
}

export interface RunPulseNext {
  /** Bold primary line — "Project · product factory" (fleet) or the routine (project). */
  title: string;
  /** ISO of the next fire (server-computed, UTC); null when unknown. */
  at: string | null;
  /** The routine's cron — lets the countdown roll forward past an elapsed slot. */
  cron?: string;
}

function Eyebrow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
      {icon}
      {children}
    </p>
  );
}

export function RunPulse({
  last,
  next,
}: {
  last: RunPulseLast;
  next: RunPulseNext;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
      {/* Last run — an AI summary of the one most recent PR + how long ago. */}
      <div className="min-w-0 flex-1">
        <Eyebrow icon={<RocketIcon className="h-3 w-3 text-sage" />}>
          Last run
          {last.source && (
            <span className="inline-flex items-center gap-1 font-normal normal-case tracking-normal text-muted/80">
              <span aria-hidden>·</span>
              <SparkleIcon className="h-2.5 w-2.5" />
              {last.source === "llm" ? "AI" : "Template"}
            </span>
          )}
        </Eyebrow>
        {last.href ? (
          <a
            href={last.href}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 block text-sm font-medium leading-snug text-ink transition-colors hover:text-clay"
          >
            {last.summary}
          </a>
        ) : (
          <p className="mt-1.5 text-sm font-medium leading-snug text-ink">
            {last.summary}
          </p>
        )}
        {(last.project || last.when) && (
          <p className="mt-1 text-xs text-muted">
            {last.project && (
              <>
                {last.project} <span aria-hidden>· </span>
              </>
            )}
            {last.when && <RelativeTime iso={last.when} />}
          </p>
        )}
      </div>

      {/* Next up — the soonest routine to fire, with its slot + countdown. */}
      <div className="min-w-0 border-t border-hairline pt-4 sm:w-[40%] sm:shrink-0 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
        <Eyebrow icon={<ClockIcon className="h-3 w-3 text-muted" />}>Next up</Eyebrow>
        <p className="mt-1.5 text-sm font-medium leading-snug text-ink">
          {next.title}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {next.at ? (
            <NextRun at={next.at} cron={next.cron} withClock />
          ) : (
            "no run scheduled"
          )}
        </p>
      </div>
    </div>
  );
}
