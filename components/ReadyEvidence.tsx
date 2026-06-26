import type { ReadyEvidence } from "@/lib/types";
import { CheckIcon, ExternalLinkIcon, ShieldIcon, XIcon } from "@/components/icons";

/**
 * The proof behind "ready": the mechanical pre-flight result + the adversarial
 * auditors that signed off, parsed from the ready-issue body. "Ready" must show
 * its proof. Degrades gracefully — always links to the issue for the full text.
 */
export function ReadyEvidenceView({
  evidence,
  issueUrl,
}: {
  evidence: ReadyEvidence;
  issueUrl?: string;
}) {
  const { preflightPassed, preflightSummary, auditorCount, auditorFindings } = evidence;

  return (
    <div className="mt-4 rounded-xl border border-sage/25 bg-card/60 p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sage-strong">
        <ShieldIcon className="h-3.5 w-3.5" />
        Proof of readiness
      </p>

      <ul className="mt-3 space-y-2 text-sm">
        <li className="flex items-start gap-2">
          {preflightPassed === false ? (
            <XIcon className="mt-0.5 h-4 w-4 shrink-0 text-clay-strong" />
          ) : (
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
          )}
          <span className="text-ink">
            Mechanical pre-flight{" "}
            {preflightPassed === false
              ? "reported failures"
              : preflightPassed === true
                ? "passed"
                : "run"}
            {preflightSummary && (
              <span className="text-muted"> · {preflightSummary}</span>
            )}
          </span>
        </li>
        <li className="flex items-start gap-2">
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
          <span className="text-ink">
            {auditorCount ?? "≥3"} independent auditors found no gap
            <span className="text-muted"> · maker ≠ checker</span>
          </span>
        </li>
      </ul>

      {auditorFindings.length > 0 && (
        <div className="mt-3 border-t border-hairline pt-3">
          <p className="mb-1.5 text-xs font-medium text-muted">What they verified</p>
          <ul className="space-y-1 text-xs text-muted">
            {auditorFindings.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-sage" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {issueUrl && (
        <a
          href={issueUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-sage-strong transition-colors hover:underline"
        >
          Full evidence in the readiness issue <ExternalLinkIcon className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}
