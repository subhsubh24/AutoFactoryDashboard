import { RelativeTime } from "@/components/RelativeTime";
import { NextRun } from "@/components/NextRun";
import { ClockIcon, RocketIcon, SparkleIcon } from "@/components/icons";

/**
 * "Last run → next run" pulse — the heartbeat line that sits right under the
 * 24-hour summary. Left: the most recent thing that shipped (regardless of which
 * project or routine), how long ago, and an AI one-line summary of that run.
 * Right: the very next routine scheduled to fire, with its local-time slot and a
 * live countdown. Used fleet-wide on the Floor and per-project on a detail page.
 */

export interface RunPulseLast {
  /** Bold primary line — the project (fleet) or the PR title (project page). */
  title: string;
  /** Link for the title — the PR that shipped. */
  href?: string;
  /** ISO of the run — drives the live "x ago". */
  when: string | null;
  /** AI one-liner of what that run did. */
  summary?: string;
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
      {/* Last shipped — what just ran, how long ago, and what it did. */}
      <div className="min-w-0 flex-1">
        <Eyebrow icon={<RocketIcon className="h-3 w-3 text-sage" />}>
          Last shipped
          {last.source && (
            <span className="inline-flex items-center gap-1 font-normal normal-case tracking-normal text-muted/80">
              <span aria-hidden>·</span>
              <SparkleIcon className="h-2.5 w-2.5" />
              {last.source === "llm" ? "AI" : "Template"}
            </span>
          )}
        </Eyebrow>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {last.href ? (
            <a
              href={last.href}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 text-sm font-medium leading-snug text-ink transition-colors hover:text-clay"
            >
              {last.title}
            </a>
          ) : (
            <span className="text-sm font-medium leading-snug text-ink">
              {last.title}
            </span>
          )}
          {last.when && (
            <span className="text-xs text-muted">
              <RelativeTime iso={last.when} />
            </span>
          )}
        </div>
        {last.summary && (
          <p className="mt-1 text-sm leading-snug text-muted">{last.summary}</p>
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
