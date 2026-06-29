import type { RoutineType } from "@/config/routines";
import type { RoutineRun } from "@/lib/routine";
import { NextRun } from "@/components/NextRun";
import { MailIcon, PulseIcon, RefreshIcon, ShieldIcon } from "@/components/icons";

/** Per-type label + icon. growth/research share styling; both run daily. */
const ROUTINE_META: Record<
  RoutineType,
  { label: string; Icon: (p: { className?: string }) => React.ReactElement }
> = {
  factory: { label: "Factory", Icon: RefreshIcon },
  growth: { label: "Growth", Icon: PulseIcon },
  research: { label: "Research", Icon: PulseIcon },
  auditor: { label: "Auditor", Icon: ShieldIcon },
  digest: { label: "Daily digest", Icon: MailIcon },
};

/**
 * A project's autonomous routines (factory · growth/research · auditor), each
 * with its next scheduled run. Times come from the authoritative cron schedule
 * (config/routines.ts), computed relative to now in UTC — disabled routines read
 * "paused", never a fabricated time.
 */
export function RoutineSchedule({ runs }: { runs: RoutineRun[] }) {
  if (runs.length === 0) return null;
  return (
    <ul className="space-y-2.5">
      {runs.map((run) => {
        const meta = ROUTINE_META[run.routine.type];
        const Icon = meta.Icon;
        return (
          <li
            key={`${run.routine.type}-${run.routine.cron}`}
            className="flex items-center justify-between gap-3"
          >
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted" />
              <span className="font-medium text-ink">{meta.label}</span>
              <span className="truncate text-xs text-muted">· {run.cadence}</span>
            </span>
            <span className="shrink-0 text-right text-xs">
              {run.routine.enabled ? (
                <NextRun
                  at={run.nextAt}
                  cron={run.routine.cron}
                  withClock
                  className="tabular text-ink"
                />
              ) : (
                <span className="text-muted">paused · no next run</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
