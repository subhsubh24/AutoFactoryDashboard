import type { FactoryDailyMetric } from "@/lib/kv";
import { Sparkline } from "@/components/Sparkline";
import { cn, type Tone } from "@/lib/utils";
import { formatCycle } from "@/lib/quality";

function lastDefined(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== null) return values[i];
  }
  return null;
}

const TONE_TEXT: Record<Tone, string> = {
  sage: "text-sage-strong",
  amber: "text-amber-strong",
  clay: "text-clay-strong",
  muted: "text-muted",
};

function Mini({
  label,
  values,
  tone,
  format,
  max,
}: {
  label: string;
  values: Array<number | null>;
  tone: Tone;
  format: (n: number) => string;
  max?: number;
}) {
  const latest = lastDefined(values);
  return (
    <div className="rounded-xl border border-hairline bg-bg p-3.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <p className={cn("mt-1 font-serif text-2xl font-medium tabular", TONE_TEXT[tone])}>
        {latest === null ? "—" : format(latest)}
      </p>
      <div className="mt-2">
        <Sparkline values={values} tone={tone} width={200} height={40} max={max} />
      </div>
    </div>
  );
}

/** Factory-wide KPI trends over time (throughput · yield · lead time). */
export function FactoryTrends({ metrics }: { metrics: FactoryDailyMetric[] }) {
  if (metrics.length < 2) {
    return (
      <p className="text-sm text-muted">
        Trends fill in as the daily snapshot runs — give it a couple of days.
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Mini
        label="Throughput"
        tone="clay"
        values={metrics.map((m) => m.prs)}
        format={(n) => `${n}/day`}
      />
      <Mini
        label="First-pass yield"
        tone="sage"
        values={metrics.map((m) => m.yieldPct)}
        format={(n) => `${n}%`}
        max={100}
      />
      <Mini
        label="Lead time"
        tone="amber"
        values={metrics.map((m) => m.leadHours)}
        format={formatCycle}
      />
    </div>
  );
}
