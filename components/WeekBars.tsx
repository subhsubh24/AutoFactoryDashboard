import type { VelocityDay } from "@/lib/aggregate";
import { cn } from "@/lib/utils";

/**
 * Dependency-free weekly velocity chart. Bars use fixed pixel heights (a flex
 * %-height collapses inside an `items-end` row), with the count above each bar
 * and the weekday label in a separate row below. Today is highlighted.
 */
export function WeekBars({ days }: { days: VelocityDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const CHART = 72; // px
  const LABEL = 16; // px reserved above the bar for the count
  const MAX_BAR = CHART - LABEL;

  return (
    <div>
      <div className="flex items-end justify-between gap-2" style={{ height: CHART }}>
        {days.map((d, i) => {
          const isToday = i === days.length - 1;
          const h =
            d.count === 0 ? 2 : Math.max(6, Math.round((d.count / max) * MAX_BAR));
          return (
            <div
              key={d.key}
              className="flex flex-1 flex-col items-center justify-end"
              title={`${d.weekday}: ${d.count} PR${d.count === 1 ? "" : "s"} merged`}
            >
              {d.count > 0 && (
                <span className="mb-1 text-[10px] leading-none tabular text-muted">
                  {d.count}
                </span>
              )}
              <div
                className={cn(
                  "w-full max-w-[2rem] rounded-t-md transition-all",
                  d.count === 0
                    ? "bg-hairline"
                    : isToday
                      ? "bg-sage"
                      : "bg-sage/55",
                )}
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between gap-2">
        {days.map((d, i) => (
          <span
            key={d.key}
            className={cn(
              "flex-1 text-center text-[10px] leading-none",
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
