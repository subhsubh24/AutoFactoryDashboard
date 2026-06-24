import type { DailyMetric } from "@/lib/kv";
import { Sparkline } from "@/components/Sparkline";
import { cn, type Tone } from "@/lib/utils";

function lastDefined(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== null) return values[i];
  }
  return null;
}

function Mini({
  label,
  values,
  tone,
  suffix = "",
  max,
}: {
  label: string;
  values: Array<number | null>;
  tone: Tone;
  suffix?: string;
  max?: number;
}) {
  const latest = lastDefined(values);
  const toneText: Record<Tone, string> = {
    sage: "text-sage-strong",
    amber: "text-amber-strong",
    clay: "text-clay-strong",
    muted: "text-muted",
  };
  return (
    <div className="rounded-xl border border-hairline bg-bg p-3.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-semibold tabular", toneText[tone])}>
        {latest === null ? "—" : `${latest}${suffix}`}
      </p>
      <div className="mt-2">
        <Sparkline values={values} tone={tone} width={200} height={40} max={max} />
      </div>
    </div>
  );
}

/** PRs/day, %-to-submission, and CI pass% trends from KV history. */
export function HistoryCharts({ metrics }: { metrics: DailyMetric[] }) {
  if (metrics.length < 2) {
    return (
      <p className="text-sm text-muted">
        Not enough history yet — trends appear once the daily snapshot cron has
        run for a couple of days.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Mini label="PRs / day" tone="clay" values={metrics.map((m) => m.prs)} />
      <Mini
        label="% to submission"
        tone="sage"
        values={metrics.map((m) => m.pct)}
        suffix="%"
        max={100}
      />
      <Mini
        label="CI pass rate"
        tone="amber"
        values={metrics.map((m) => m.ciPassRate)}
        suffix="%"
        max={100}
      />
    </div>
  );
}
