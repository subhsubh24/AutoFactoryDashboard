import type { Liveness } from "@/lib/types";
import { cn, livenessMeta, toneClasses } from "@/lib/utils";

/**
 * The "is it still running?" dot: green when the loop shipped recently, amber
 * when slowing, red when it may be stalled. Optionally shows the label.
 */
export function LivenessDot({
  liveness,
  showLabel = false,
  className,
}: {
  liveness: Liveness;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = livenessMeta(liveness);
  const tone = toneClasses(meta.tone);
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={`Loop liveness — ${meta.label}`}
    >
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          tone.dot,
          meta.pulse && "animate-pulse-soft",
        )}
        aria-hidden
      />
      {showLabel && <span className={cn("text-xs", tone.text)}>{meta.label}</span>}
    </span>
  );
}
