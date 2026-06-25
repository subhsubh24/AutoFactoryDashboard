import type { VelocityDay } from "@/lib/aggregate";
import { cn } from "@/lib/utils";

/**
 * Weekly velocity chart. Fixed-pixel bar heights (a flex %-height collapses
 * inside an `items-end` row), solid fills so every bar is visible on dark, and
 * today rendered in the brighter accent.
 */
export function WeekBars({ days }: { days: VelocityDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const CHART = 116; // px
  const LABEL = 20; // px reserved above each bar for its count
  const MAX_BAR = CHART - LABEL;

  return (
    <div>
      <div
        className="flex items-end justify-between gap-2.5"
        style={{ height: CHART }}
      >
        {days.map((d, i) => {
          const isToday = i === days.length - 1;
          const h =
            d.count === 0 ? 2 : Math.max(8, Math.round((d.count / max) * MAX_BAR));
          return (
            <div
              key={d.key}
              className="flex flex-1 flex-col items-center justify-end"
              title={`${d.weekday}: ${d.count} PR${d.count === 1 ? "" : "s"} merged`}
            >
              {d.count > 0 && (
                <span
                  className={cn(
                    "mb-1.5 text-xs leading-none tabular",
                    isToday ? "font-semibold text-ink" : "text-muted",
                  )}
                >
                  {d.count}
                </span>
              )}
              <div
                className={cn(
                  "w-full max-w-[2.5rem] rounded-t-md transition-all",
                  d.count === 0
                    ? "bg-hairline"
                    : isToday
                      ? "bg-sage-strong"
                      : "bg-sage",
                )}
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex justify-between gap-2.5">
        {days.map((d, i) => (
          <span
            key={d.key}
            className={cn(
              "flex-1 text-center text-[11px] leading-none",
              i === days.length - 1 ? "font-semibold text-ink" : "text-muted",
            )}
          >
            {d.weekday}
          </span>
        ))}
      </div>
    </div>
  );
}
