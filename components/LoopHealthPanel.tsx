import type { LoopHealth, LoopSignal } from "@/lib/loophealth";
import { cn, type Tone } from "@/lib/utils";
import { Chip } from "@/components/Chip";
import { AlertIcon, ExternalLinkIcon } from "@/components/icons";

/** Signal → label + tone. bootstrapping reads quiet ("not reported yet"). */
export const LOOP_SIGNAL_META: Record<LoopSignal, { label: string; tone: Tone }> = {
  bootstrapping: { label: "Bootstrapping", tone: "muted" },
  improving: { label: "Improving", tone: "sage" },
  steady: { label: "Steady", tone: "sage" },
  churning: { label: "Churning", tone: "amber" },
  stuck: { label: "Stuck", tone: "clay" },
};

/** A compact "loop: <signal>" chip — the fleet-glance loop state. */
export function LoopSignalChip({ signal }: { signal: LoopSignal | null }) {
  const m = signal ? LOOP_SIGNAL_META[signal] : { label: "no signal", tone: "muted" as Tone };
  return <Chip tone={m.tone}>loop: {m.label.toLowerCase()}</Chip>;
}

function shortDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const fmt = (n: number | null): string => (n === null ? "—" : n.toLocaleString("en-US"));

function LStat({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: number | null;
  tone?: "ink" | "sage" | "clay";
}) {
  const color =
    tone === "sage" ? "text-sage-strong" : tone === "clay" ? "text-clay-strong" : "text-ink";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted">{label}</span>
      <span className={cn("text-sm font-semibold tabular", value ? color : "text-muted")}>
        {fmt(value)}
      </span>
    </div>
  );
}

/**
 * The loop's self-reported health (docs/autonomous-loop/LOOP_HEALTH.md): the
 * trajectory signal, what happened this run + over 7 days, and — most important
 * — the recurring walls it can't clear on its own (the "loop needs you" detail).
 * 0/null/bootstrapping read as "not reported", never inflated.
 */
export function LoopHealthPanel({ loop }: { loop: LoopHealth }) {
  if (!loop.available) {
    return (
      <p className="text-sm text-muted">
        {loop.reason ?? "No loop-health block reported."}
      </p>
    );
  }
  const tr = loop.thisRun;
  const r7 = loop.rolling7d;
  const asOf = shortDate(loop.asOf);

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LoopSignalChip signal={loop.signal} />
        {asOf && <span className="text-xs text-muted">as of {asOf}</span>}
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
          This run
        </p>
        <div className="grid grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-2">
          <LStat label="Changes shipped" value={tr.changesShipped} tone="sage" />
          <LStat
            label="Abandoned"
            value={tr.changesAbandoned}
            tone={(tr.changesAbandoned ?? 0) > 0 ? "clay" : "ink"}
          />
          <LStat label="Verify-cycle fails" value={tr.verifyCycleFailures} />
          <LStat label="Review rejects" value={tr.reviewRejections} />
          <LStat
            label="Breaker trips"
            value={tr.circuitBreakerTrips}
            tone={(tr.circuitBreakerTrips ?? 0) > 0 ? "clay" : "ink"}
          />
        </div>
      </div>

      <div className="border-t border-hairline pt-3">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
          Rolling 7 days
        </p>
        <div className="grid grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-2">
          <LStat label="Merged PRs" value={r7.mergedPrs} />
          <LStat
            label="Reverts"
            value={r7.reverts}
            tone={(r7.reverts ?? 0) > 0 ? "clay" : "ink"}
          />
          <LStat label="Readiness attempts" value={r7.readinessAttempts} />
          <LStat
            label="Readiness rejected"
            value={r7.readinessRejected}
            tone={(r7.readinessRejected ?? 0) > 0 ? "clay" : "ink"}
          />
          <LStat
            label="Harness proposals"
            value={r7.harnessProposalsOpen}
            tone={(r7.harnessProposalsOpen ?? 0) > 0 ? "clay" : "ink"}
          />
        </div>
      </div>

      {r7.recurringFailures.length > 0 && (
        <div className="border-t border-hairline pt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-clay-strong">
            <AlertIcon className="h-3.5 w-3.5" />
            Recurring walls — the loop needs you
          </p>
          <ul className="space-y-1.5">
            {r7.recurringFailures.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-snug text-ink">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-clay" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loop.sourceUrl && (
        <a
          href={loop.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-clay"
        >
          LOOP_HEALTH.md <ExternalLinkIcon className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
