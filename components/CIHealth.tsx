import type { CIInfo, CIStatus } from "@/lib/types";
import { ciMeta, cn, toneClasses } from "@/lib/utils";

/** Minimal CI status dot — used in dense rows (cards, feed). */
export function CIDot({
  status,
  className,
  title,
}: {
  status: CIStatus;
  className?: string;
  title?: string;
}) {
  const meta = ciMeta(status);
  const tone = toneClasses(meta.tone);
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", tone.dot, className)}
      title={title ?? `CI: ${meta.label}`}
      aria-label={`CI ${meta.label}`}
    />
  );
}

/** CI status with label + optional pass rate. */
export function CIHealth({ ci }: { ci: CIInfo }) {
  const meta = ciMeta(ci.status);
  const tone = toneClasses(meta.tone);

  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
          tone.badge,
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
        {meta.label}
      </span>
      {ci.passRate !== null && ci.totalRuns > 0 && (
        <span className="text-xs text-muted">
          <span className="tabular text-ink">{ci.passRate}%</span> pass ·{" "}
          {ci.totalRuns} {ci.totalRuns === 1 ? "run" : "runs"}
        </span>
      )}
    </div>
  );
}
