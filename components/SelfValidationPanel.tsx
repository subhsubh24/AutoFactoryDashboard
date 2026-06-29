import type { SelfValidation } from "@/lib/validation";
import { cn, pluralize } from "@/lib/utils";
import { AlertIcon, CheckIcon, ExternalLinkIcon, ShieldIcon } from "@/components/icons";

function gateLabel(sv: SelfValidation): string {
  if (sv.enforcedInCi === true) return "Gate enforced in CI";
  if (sv.enforcedInCi === false) return "Gate built, not enforced";
  return "Gate present"; // manifest-only — CI enforcement unknown
}

/**
 * The per-project self-validation gate (LOOP_HEALTH `validation` block, else the
 * CAPABILITIES.yml manifest): is the capabilities tripwire enforced in CI, how
 * many capabilities are declared, and how many are OWNER-BLOCKED — needing a
 * secret CI can't supply. Owner-blocked > 0 is the loop saying it can't validate
 * a flow until you wire the key (each is also an urgent owner action). A repo
 * with no block/manifest reads "gate not built here yet".
 */
export function SelfValidationPanel({ sv }: { sv: SelfValidation }) {
  if (!sv.available) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <ShieldIcon className="h-4 w-4 text-amber" />
        The self-validation gate isn&apos;t built in this repo yet.
      </p>
    );
  }
  const unmet = sv.unmet.length;
  const enforced = sv.enforcedInCi === true;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-hairline bg-bg px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm">
          <ShieldIcon className={cn("h-4 w-4", enforced ? "text-sage" : "text-amber")} />
          <span className="font-medium text-ink">{gateLabel(sv)}</span>
        </span>
        {enforced ? (
          <CheckIcon className="h-4 w-4 text-sage" />
        ) : (
          <span className="text-xs font-medium text-amber-strong">not built / off</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
        <Stat
          label="Capabilities"
          value={sv.capabilitiesTotal}
          sub={sv.active != null ? `${sv.active} active` : undefined}
        />
        <Stat label="Owner-blocked" value={unmet} blocked={unmet > 0} />
      </div>

      {unmet > 0 ? (
        <div className="rounded-xl border border-clay/30 bg-clay-soft/50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-clay-strong">
            <AlertIcon className="h-3.5 w-3.5" />
            Needs your key to validate
          </p>
          <ul className="mt-1.5 space-y-1">
            {sv.unmet.map((c) => (
              <li key={c} className="flex items-start gap-2 text-xs text-ink">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-clay" />
                <span className="font-mono">{c}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Each is an urgent <span className="font-mono">validation-capability-*</span> owner
            action in the Action plan — the loop can&apos;t validate these flows until you wire the secret.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted">
          Every capability is CI-validatable — nothing blocked on you.
        </p>
      )}

      {sv.unmetUnsurfaced.length > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-clay-strong">
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {sv.unmetUnsurfaced.length} unmet {pluralize(sv.unmetUnsurfaced.length, "capability", "capabilities")} not
          surfaced as an owner action — a loop bug worth flagging.
        </p>
      )}

      {sv.sourceUrl && (
        <a
          href={sv.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-clay"
        >
          {sv.source === "manifest" ? "CAPABILITIES.yml" : "LOOP_HEALTH.md"}
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  blocked = false,
}: {
  label: string;
  value: number | null;
  sub?: string;
  blocked?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold tabular",
          blocked ? "text-clay-strong" : value ? "text-ink" : "text-muted",
        )}
      >
        {value ?? "—"}
        {sub && <span className="ml-1 text-[11px] font-normal text-muted">· {sub}</span>}
      </span>
    </div>
  );
}

/**
 * Compact one-line self-validation status for the dense Floor tile: the gate
 * state, capability count, and an owner-blocked count flagged red.
 */
export function SelfValidationLine({ sv }: { sv: SelfValidation }) {
  if (!sv.available) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <ShieldIcon className="h-3.5 w-3.5 shrink-0 text-muted/70" />
        self-validation <span aria-hidden>·</span>{" "}
        <span className="text-amber-strong">gate not built yet</span>
      </p>
    );
  }
  const unmet = sv.unmet.length;
  const enforced = sv.enforcedInCi === true;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
      <ShieldIcon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          unmet > 0 ? "text-clay" : enforced ? "text-sage" : "text-amber",
        )}
      />
      <span>self-validation</span>
      <span aria-hidden>·</span>
      {enforced ? (
        <span className="text-sage-strong">gate on</span>
      ) : (
        <span className="text-amber-strong">gate off</span>
      )}
      {sv.capabilitiesTotal != null && (
        <span>
          · {sv.capabilitiesTotal} {pluralize(sv.capabilitiesTotal, "capability", "capabilities")}
        </span>
      )}
      {unmet > 0 && (
        <span className="font-medium text-clay-strong">· {unmet} owner-blocked</span>
      )}
    </p>
  );
}
