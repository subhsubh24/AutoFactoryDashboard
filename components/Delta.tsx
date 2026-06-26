import { cn } from "@/lib/utils";

/**
 * A single day-over-day delta, e.g. "build +5pts ▲". Renders nothing when the
 * value is null (unmeasured / no baseline). `higherIsBetter=false` flips the
 * color so a rise in, say, pending ops reads as attention (clay), not progress.
 */
export function DeltaPill({
  value,
  label,
  unit = "",
  higherIsBetter = true,
}: {
  value: number | null;
  label: string;
  unit?: string;
  higherIsBetter?: boolean;
}) {
  if (value === null) return null;
  if (value === 0) {
    return (
      <span className="text-xs text-muted">
        {label} <span className="tabular">flat</span>
      </span>
    );
  }
  const up = value > 0;
  const good = higherIsBetter ? up : !up;
  return (
    <span
      className={cn(
        "text-xs font-medium tabular",
        good ? "text-sage-strong" : "text-clay-strong",
      )}
    >
      {label} {up ? "+" : ""}
      {value}
      {unit} <span aria-hidden>{up ? "▲" : "▼"}</span>
    </span>
  );
}

/**
 * The 24h delta line — the digest's real value. Works for a project or the
 * whole factory (same shape). Falls back to a clear "fills in" note when no
 * KV baseline exists yet.
 */
export function Delta24h({
  shipped,
  dBuildPct,
  dReadinessPct,
  newPendingOps,
  hasBaseline,
  className,
}: {
  shipped: number;
  dBuildPct: number | null;
  dReadinessPct: number | null;
  newPendingOps: number | null;
  hasBaseline: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", className)}>
      <span className="text-muted">
        <span className="font-semibold tabular text-ink">{shipped}</span> shipped · 24h
      </span>
      {hasBaseline ? (
        <>
          <span aria-hidden className="text-muted/40">
            ·
          </span>
          <DeltaPill value={dReadinessPct} label="ready" unit="pts" />
          <DeltaPill value={dBuildPct} label="build" unit="pts" />
          <DeltaPill value={newPendingOps} label="pending" higherIsBetter={false} />
        </>
      ) : (
        <span className="text-muted/70">· Δ vs yesterday fills in once daily history records</span>
      )}
    </div>
  );
}
