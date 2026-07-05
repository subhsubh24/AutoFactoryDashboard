import type { GrowthDemand } from "@/lib/growth";
import { cn } from "@/lib/utils";

/**
 * The demand → confidence link, shown next to the business-case number.
 *
 * Pre-launch market demand signal (§10) informs the business case as a
 * CONFIDENCE + direction input — never a fabricated figure (§4 anti-gaming). This
 * makes that reconciliation visible: it shows the demand strength beside the
 * ARR estimate and states plainly that it moves confidence, not the number.
 * Absent demand → renders nothing.
 */

const DOT: Record<string, string> = {
  none: "bg-muted",
  weak: "bg-amber-500",
  emerging: "bg-sage",
  strong: "bg-emerald-500",
};

export function DemandConfidenceNote({ demand }: { demand?: GrowthDemand }) {
  if (!demand || demand.themes.length === 0) return null;
  const strength = demand.overallStrength ?? "none";
  if (strength === "none") return null;

  const solved = demand.themes.filter((t) =>
    /yes|partial/i.test(t.productSolves ?? ""),
  ).length;

  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[strength] ?? DOT.none)} />
      <span className="font-medium text-ink">Demand corroboration: {strength}</span>
      <span>
        — {solved > 0 ? `${solved} cited pain theme${solved === 1 ? "" : "s"} the product solves` : "market pain cited"}
        {demand.disconfirming.length > 0 && `, ${demand.disconfirming.length} counter-signal`}.
      </span>
      <span className="italic">Informs confidence in the estimate — not the number itself (§10/§4).</span>
    </p>
  );
}
