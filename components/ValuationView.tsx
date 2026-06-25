import type { Valuation } from "@/lib/businesscase";
import { cn, formatMoney } from "@/lib/utils";
import { ExternalLinkIcon } from "@/components/icons";

export const VALUATION_DISCLAIMER =
  "Pre-launch estimate. 'Business case' = the project's own bottoms-up model; " +
  "'heuristic' = rough price×adoption fallback. Not a valuation; actual revenue " +
  "is a post-launch market outcome.";

function shortDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Small note about the revenue "floor" target, when the summary block states one. */
function floorNote(v: Valuation): string | null {
  if (!v.floorUsd) return null;
  const floor = formatMoney(v.floorUsd);
  // Only inline the time if it's short & clean; long descriptions stay in the file.
  const t = v.timeToFloor?.trim();
  const shortTime = t && t.length <= 16 && !/[;()]/.test(t) ? t : null;
  if (v.floorMetYear1 === true) return `clears ${floor} floor in year 1`;
  if (shortTime) return `reaches ${floor} ~${shortTime}`;
  if (v.floorMetYear1 === false) return `below ${floor} floor in year 1`;
  return `${floor} floor`;
}

export function SourceBadge({ source }: { source: Valuation["source"] }) {
  const isBC = source === "business_case";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium",
        isBC ? "bg-sage-soft text-sage-strong" : "bg-amber-soft text-amber-strong",
      )}
    >
      {isBC ? "business case" : "rough heuristic"}
    </span>
  );
}

/** Always shows the low–high range with the base as headline; never a lone number. */
export function ValuationView({
  v,
  className,
}: {
  v: Valuation;
  className?: string;
}) {
  if (!v) return null;
  const isBC = v.source === "business_case";
  const asOf = shortDate(v.asOf);
  const note = floorNote(v);

  // Business case present but no plausible ARR parsed — link, never a fabricated number.
  if (v.arrExpected <= 0) {
    if (!isBC) return null;
    return (
      <div
        className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs", className)}
        title={VALUATION_DISCLAIMER}
      >
        <span className="rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium text-muted">
          business case
        </span>
        <span className="text-muted">unparseable — see file</span>
        {v.sourceUrl && (
          <a
            href={v.sourceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Open the business case"
            className="text-muted transition-colors hover:text-clay"
          >
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs", className)}
      title={VALUATION_DISCLAIMER}
    >
      <span className="font-semibold text-sage-strong">
        ~{formatMoney(v.arrExpected)}/yr
      </span>
      {v.scenarioLabel && <span className="text-muted">{v.scenarioLabel}</span>}
      <span className="text-muted">
        range {formatMoney(v.arrLow)}–{formatMoney(v.arrHigh)}
      </span>
      {note && <span className="text-muted">· {note}</span>}
      <SourceBadge source={v.source} />
      {isBC && asOf && <span className="text-muted">as of {asOf}</span>}
      {isBC && v.sourceUrl && (
        <a
          href={v.sourceUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Open the business case"
          className="text-muted transition-colors hover:text-clay"
        >
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
