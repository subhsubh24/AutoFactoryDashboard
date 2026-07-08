import type { GrowthDemand } from "@/lib/growth";
import { cn } from "@/lib/utils";
import { CheckIcon, ExternalLinkIcon, PulseIcon, SparkleIcon } from "@/components/icons";

/**
 * Pre-launch market DEMAND signal (GTM_STANDARD §10) — corroborated pain themes
 * mined from reviews / forums / Reddit / X. This is the INITIAL-DIRECTION signal
 * and is DISTINCT from user PMF (`pmf.signal`, which is correctly "none" until
 * real users exist post-launch). Everything here is real cited evidence from the
 * `demand_signal` block; absent → the panel doesn't render.
 */

// On-palette + monotonic: muted → amber → sage (one green for both positive
// levels; the label carries emerging-vs-strong, not a second hue). Raw amber-500/
// emerald-500 were off the sage/clay/amber/muted system and untuned for dark.
const STRENGTH_META: Record<string, { label: string; dot: string; text: string }> = {
  none: { label: "No demand signal yet", dot: "bg-muted", text: "text-muted" },
  weak: { label: "Weak", dot: "bg-amber", text: "text-amber-strong" },
  emerging: { label: "Emerging", dot: "bg-sage/70", text: "text-sage-strong" },
  strong: { label: "Strong", dot: "bg-sage", text: "text-sage-strong" },
};

function SolvesTag({ solves }: { solves: string | null }) {
  if (!solves) return null;
  const s = solves.toLowerCase();
  const meta =
    s === "yes"
      ? { label: "we solve", cls: "border-sage/40 text-sage-strong" }
      : s === "partial"
        ? { label: "partial", cls: "border-amber/40 text-amber-strong" }
        : { label: "not solved", cls: "border-hairline text-muted" };
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium", meta.cls)}>
      {meta.label}
    </span>
  );
}

export function DemandSignalPanel({
  demand,
  counterSummary,
}: {
  demand?: GrowthDemand;
  /** Plain-language AI summary of ALL the counter-signal notes (falls back to
      the raw list when absent). */
  counterSummary?: string | null;
}) {
  if (!demand || (demand.themes.length === 0 && !demand.overallStrength)) return null;

  const strength = demand.overallStrength ?? "none";
  const meta = STRENGTH_META[strength] ?? STRENGTH_META.none;

  return (
    <div className="rounded-xl border border-hairline bg-bg px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <PulseIcon className="h-4 w-4 text-muted" />
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
            Demand signal
          </p>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
            <span className={cn("text-xs font-medium", meta.text)}>{meta.label}</span>
          </span>
        </div>
        {demand.asOf && <span className="text-[11px] text-muted">as of {demand.asOf}</span>}
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
        Market pain mined from public reviews / forums / Reddit / X — the pre-launch direction signal.
        Distinct from user PMF (which needs real users post-launch).
      </p>

      {demand.themes.length > 0 && (
        <ul className="mt-3 space-y-2.5">
          {demand.themes.slice(0, 5).map((t, i) => (
            <li key={i} className="border-t border-hairline pt-2.5 first:border-t-0 first:pt-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-ink">{t.label}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  {t.strength && (
                    <span className="text-[10px] uppercase tracking-wide text-muted">{t.strength}</span>
                  )}
                  <SolvesTag solves={t.productSolves} />
                </div>
              </div>
              {t.quote && (
                <p className="mt-1 text-[13px] italic leading-snug text-muted">
                  &ldquo;{t.quote}&rdquo;
                  {t.source && <span className="not-italic"> — {t.source}</span>}
                  {t.url && (
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 inline-flex items-center text-muted hover:text-clay"
                    >
                      <ExternalLinkIcon className="h-3 w-3" />
                    </a>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {(counterSummary || demand.disconfirming.length > 0) && (
        <div className="mt-3 border-t border-hairline pt-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
            Counter-signal
            {counterSummary && (
              <span className="inline-flex items-center gap-1 font-normal normal-case tracking-normal text-muted/80">
                <span aria-hidden>·</span>
                <SparkleIcon className="h-2.5 w-2.5" />
                AI
              </span>
            )}
          </p>
          {counterSummary ? (
            // A plain-language read of ALL the run-by-run caveat notes.
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{counterSummary}</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {demand.disconfirming.slice(0, 3).map((d, i) => (
                <li key={i} className="text-[13px] leading-snug text-muted">
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(demand.sourcesCovered.length > 0 || demand.sourcesUnconnected.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline pt-2.5 text-[11px]">
          {demand.sourcesCovered.length > 0 && (
            <span className="inline-flex items-center gap-1 text-muted">
              <CheckIcon className="h-3 w-3 text-sage" />
              covered: {demand.sourcesCovered.join(", ")}
            </span>
          )}
          {demand.sourcesUnconnected.length > 0 && (
            <span className="text-muted">
              needs owner connect: <span className="text-ink">{demand.sourcesUnconnected.join(", ")}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
