import type { SelfValidation } from "@/lib/validation";
import type { QualityScorecard } from "@/lib/scorecard";
import { cn, pluralize } from "@/lib/utils";
import { AlertIcon, CheckIcon, ExternalLinkIcon, ShieldIcon } from "@/components/icons";

/**
 * One CI gate's status row: the required-check name, whether it's enforced, and
 * a green/red pass state — or "gate not built here yet" when the repo hasn't
 * shipped it. Used for both validate-capabilities (product) and validate-gtm.
 */
function GateRow({
  label,
  present,
  enforced,
  ok,
  okText,
  failText,
}: {
  label: string;
  present: boolean;
  /** true = required CI check; false = built but not enforced; null = unknown. */
  enforced: boolean | null;
  /** Pass (green) / fail (red) / null = n/a. */
  ok: boolean | null;
  okText: string;
  failText: string;
}) {
  if (!present) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-hairline bg-bg px-3 py-2">
        <span className="flex items-center gap-2 text-sm">
          <ShieldIcon className="h-4 w-4 shrink-0 text-amber" />
          <span className="font-mono text-[13px] font-medium text-ink">{label}</span>
        </span>
        <span className="shrink-0 text-xs font-medium text-amber-strong">
          gate not built here yet
        </span>
      </div>
    );
  }
  const passing = ok === true;
  const failing = ok === false;
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-hairline bg-bg px-3 py-2">
      <span className="flex min-w-0 items-center gap-x-2 gap-y-0 flex-wrap text-sm">
        <ShieldIcon className={cn("h-4 w-4 shrink-0", failing ? "text-clay" : "text-sage")} />
        <span className="font-mono text-[13px] font-medium text-ink">{label}</span>
        <span className="text-[11px] text-muted">
          {enforced === true
            ? "· enforced in CI"
            : enforced === false
              ? "· built, not enforced"
              : "· active"}
        </span>
      </span>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
          passing ? "text-sage-strong" : failing ? "text-clay-strong" : "text-muted",
        )}
      >
        {passing && <CheckIcon className="h-3.5 w-3.5" />}
        {failing && <AlertIcon className="h-3.5 w-3.5" />}
        {passing ? okText : failing ? failText : "—"}
      </span>
    </div>
  );
}

/**
 * The per-project self-validation gates: the product capability tripwire
 * (validate-capabilities) and the GTM auditor gate (validate-gtm), shown side by
 * side, plus the capability detail — how many are OWNER-BLOCKED (need a secret CI
 * can't supply). REAL data only; an absent gate reads "gate not built here yet".
 */
export function SelfValidationPanel({
  sv,
  gtm,
}: {
  sv: SelfValidation;
  /** GTM auditor scorecard — drives the validate-gtm gate row. */
  gtm?: QualityScorecard;
}) {
  const unmet = sv.available ? sv.unmet.length : 0;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <GateRow
          label="validate-capabilities"
          present={sv.available}
          enforced={sv.enforcedInCi}
          ok={sv.available ? unmet === 0 : null}
          okText="all validatable"
          failText={`${unmet} owner-blocked`}
        />
        <GateRow
          label="validate-gtm"
          present={!!gtm?.available}
          enforced={gtm?.enforcedInCi ?? null}
          ok={gtm?.shipGateMet ?? null}
          okText="ship gate met"
          failText="ship-critical GTM dim below A"
        />
      </div>

      {sv.available && (
        <div className="space-y-3 border-t border-hairline pt-3">
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
              {sv.unmetUnsurfaced.length} unmet{" "}
              {pluralize(sv.unmetUnsurfaced.length, "capability", "capabilities")} not surfaced as
              an owner action — a loop bug worth flagging.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1">
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
        {gtm?.available && gtm.sourceUrl && (
          <a
            href={gtm.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-clay"
          >
            GTM_SCORECARD.md
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
        )}
      </div>
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
