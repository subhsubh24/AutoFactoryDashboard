import type { ReadinessGates } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckIcon, ClockIcon, ExternalLinkIcon } from "@/components/icons";

type GateState = "pass" | "progress" | "pending" | "unknown";

/**
 * The readiness gates between a project and "ready" — shown when NOT ready so
 * the WHY is visible. Brand-new in the repos: a gate that doesn't exist yet
 * reads "not yet built / not yet run" in muted tone, NOT as a failure. We only
 * ever show state we actually observed.
 */
export function ReadinessGatesView({
  gates,
  preflightUrl,
}: {
  gates: ReadinessGates;
  preflightUrl?: string;
}) {
  return (
    <ul className="space-y-3">
      <GateRow
        label="Definition of Done"
        state={gates.dodComplete ? "pass" : gates.dodAvailable ? "progress" : "unknown"}
        detail={
          gates.dodAvailable
            ? `${gates.dodDone}/${gates.dodTotal} checkboxes checked`
            : "no Definition-of-Done section found"
        }
      />
      <GateRow
        label="Mechanical pre-flight"
        state={
          !gates.preflightChecked ? "unknown" : gates.preflightPresent ? "pass" : "pending"
        }
        detail={
          !gates.preflightChecked
            ? "not checked"
            : gates.preflightPresent
              ? "scripts/preflight.sh present"
              : "scripts/preflight.sh — not yet built"
        }
        href={gates.preflightPresent ? preflightUrl : undefined}
      />
      <GateRow
        label="Adversarial readiness audit"
        state={gates.auditState === "passed" ? "pass" : "pending"}
        detail={
          gates.auditState === "passed"
            ? "≥3 independent auditors signed off"
            : "not yet run — runs with the ready gate"
        }
      />
    </ul>
  );
}

function GateRow({
  label,
  state,
  detail,
  href,
}: {
  label: string;
  state: GateState;
  detail: string;
  href?: string;
}) {
  const pass = state === "pass";
  const progress = state === "progress";
  const tone = pass ? "text-sage-strong" : progress ? "text-amber-strong" : "text-muted";
  return (
    <li className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        <span className={cn("mt-0.5 shrink-0", tone)} aria-hidden>
          {pass ? (
            <CheckIcon className="h-4 w-4" />
          ) : progress ? (
            <span className="block h-2 w-2 translate-y-1 rounded-full bg-amber" />
          ) : (
            <ClockIcon className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm leading-snug text-ink">{label}</p>
          <p className="text-xs leading-snug text-muted">{detail}</p>
        </div>
      </div>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${label}`}
          className="mt-0.5 shrink-0 text-muted transition-colors hover:text-clay"
        >
          <ExternalLinkIcon className="h-3.5 w-3.5" />
        </a>
      )}
    </li>
  );
}
