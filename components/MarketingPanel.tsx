import type { GrowthMarketing } from "@/lib/growth";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  XIcon,
  RocketIcon,
  LockIcon,
  ClockIcon,
  ShieldIcon,
  ExternalLinkIcon,
} from "@/components/icons";

/**
 * Autonomous marketing launch (GTM_STANDARD §13) — the OPT-OUT gate the owner
 * approves nothing for. Everything here is rendered straight from the
 * `marketing:` block in docs/growth/GROWTH_STATUS.md: the values are data, never
 * instructions, and we show the real state — never a synthesized "live". The
 * launch only arms when readiness is PROVEN (ship_gate_met + a full computer-use
 * E2E sweep green + reviewed assets); it then auto-GOes after the veto window
 * unless the kill switch (docs/growth/MARKETING_HOLD) is set.
 */

const STATUS_META: Record<
  string,
  { label: string; dot: string; text: string; ring: string }
> = {
  not_armed: {
    label: "Not armed — readiness not yet proven",
    dot: "bg-muted",
    text: "text-muted",
    ring: "border-hairline",
  },
  proposed: {
    label: "Proposed — auto-GO pending (you approve nothing)",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    ring: "border-amber-500/40",
  },
  live: {
    label: "Live — marketing running autonomously",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    ring: "border-emerald-500/40",
  },
  held: {
    label: "Held — kill switch engaged (MARKETING_HOLD)",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    ring: "border-red-500/40",
  },
};

function ReadyRow({ label, met }: { label: string; met: boolean | null }) {
  const ok = met === true;
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckIcon className="h-4 w-4 shrink-0 text-emerald-500" />
      ) : (
        <XIcon className="h-4 w-4 shrink-0 text-muted" />
      )}
      <span className={ok ? "text-ink" : "text-muted"}>{label}</span>
    </li>
  );
}

export function MarketingPanel({
  marketing,
  sourceUrl,
  className,
}: {
  marketing?: GrowthMarketing;
  sourceUrl?: string;
  className?: string;
}) {
  if (!marketing) return null;
  const { status, readiness, armedAt, vetoWindowHours, goAt, channels, plan, canaryStage, hold, notes } =
    marketing;

  // Nothing meaningful emitted yet → render nothing (stay calm, no empty card).
  const noReadiness =
    readiness.shipGateMet === null &&
    readiness.e2eSweepGreen === null &&
    readiness.assetsReady === null;
  if (!status && noReadiness && plan.length === 0 && channels.length === 0) return null;

  const meta = STATUS_META[status ?? "not_armed"] ?? STATUS_META.not_armed;
  const allReady =
    readiness.shipGateMet === true &&
    readiness.e2eSweepGreen === true &&
    readiness.assetsReady === true;

  return (
    <div className={cn("rounded-xl border bg-card p-5", meta.ring, className)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <RocketIcon className="h-5 w-5 text-ink" />
          <div>
            <h3 className="text-sm font-semibold text-ink">Autonomous marketing launch</h3>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
              <span className={cn("text-xs font-medium", meta.text)}>{meta.label}</span>
            </div>
          </div>
        </div>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
          >
            source <ExternalLinkIcon className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Held banner — the kill switch always wins, surface it loudest. */}
      {(status === "held" || hold === true) && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <ShieldIcon className="h-4 w-4 shrink-0" />
          <span>
            Paused by kill switch (<code className="text-xs">docs/growth/MARKETING_HOLD</code>). All
            outbound halted. Remove the file to resume.
          </span>
        </div>
      )}

      {/* Readiness gate — all three must be proven to arm. */}
      <div className="mt-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted">
          Readiness gate {allReady ? "· met" : "· not yet met"}
        </p>
        <ul className="mt-1.5 space-y-1">
          <ReadyRow label="Ship gate met (independent scorecard)" met={readiness.shipGateMet} />
          <ReadyRow label="Full computer-use E2E sweep green" met={readiness.e2eSweepGreen} />
          <ReadyRow label="Launch assets reviewed (maker≠checker)" met={readiness.assetsReady} />
        </ul>
      </div>

      {/* Auto-GO window (opt-out) — shown once proposed. */}
      {status === "proposed" && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-hairline bg-bg px-3 py-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <ClockIcon className="h-3.5 w-3.5" />
            Auto-GO {goAt ? <span className="tabular text-ink">at {goAt} UTC</span> : "pending"} — you
            approve nothing
          </span>
          {armedAt && <span>armed {armedAt}</span>}
          {vetoWindowHours !== null && <span>veto window {vetoWindowHours}h</span>}
        </div>
      )}

      {/* Canary stage once live. */}
      {status === "live" && canaryStage && (
        <p className="mt-3 text-xs text-muted">
          Canary ramp: <span className="text-ink">{canaryStage}</span>
        </p>
      )}

      {/* Channels the plan uses (authorized only). */}
      {channels.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted">
            Authorized channels
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {channels.map((c) => (
              <span
                key={c}
                className="rounded-md border border-hairline bg-bg px-2 py-0.5 text-xs text-ink"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* The proposed / running plan. */}
      {plan.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted">
            {status === "live" ? "Marketing plan (running)" : "Proposed plan"}
          </p>
          <ul className="mt-1.5 space-y-1">
            {plan.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes && <p className="mt-3 text-xs text-muted">{notes}</p>}

      {/* Kill-switch reminder (when not already held). */}
      {status !== "held" && hold !== true && (
        <div className="mt-4 flex items-center gap-2 border-t border-hairline pt-3 text-xs text-muted">
          <LockIcon className="h-3.5 w-3.5 shrink-0" />
          <span>
            Kill switch: add <code className="text-[11px]">docs/growth/MARKETING_HOLD</code> to halt
            everything — you approve nothing to start, and stop anytime.
          </span>
        </div>
      )}
    </div>
  );
}
