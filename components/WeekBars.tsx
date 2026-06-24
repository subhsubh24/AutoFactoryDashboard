import type { VelocityDay } from "@/lib/aggregate";
import { cn } from "@/lib/utils";

/**
 * A dependency-free weekly velocity chart: one bar per day, height scaled to the
 * busiest day. Today is the rightmost bar and is highlighted.
 */
export function WeekBars({ days }: { days: VelocityDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));

  return (
    <div className="flex h-20 items-end justify-between gap-1.5">
      {days.map((d, i) => {
        const isToday = i === days.length - 1;
        const heightPct = d.count === 0 ? 0 : (d.count / max) * 100;
        return (
          <div
            key={d.key}
            className="flex flex-1 flex-col items-center gap-1.5"
            title={`${d.weekday}: ${d.count} PR${d.count === 1 ? "" : "s"} merged`}
          >
            <div className="relative flex w-full flex-1 items-end justify-center">
              {d.count > 0 && (
                <span className="absolute -top-0.5 text-[10px] tabular text-muted">
                  {d.count}
                </span>
              )}
              <div
                className={cn(
                  "w-full max-w-[1.75rem] rounded-t-md transition-all",
                  d.count === 0
                    ? "bg-hairline"
                    : isToday
                      ? "bg-sage"
                      : "bg-sage/55",
                )}
                style={{
                  height: d.count === 0 ? "2px" : `max(8px, ${heightPct}%)`,
                }}
              />
            </div>
            <span
              className={cn(
                "text-[10px]",
                isToday ? "font-semibold text-ink" : "text-muted",
              )}
            >
              {d.weekday}
            </span>
          </div>
        );
      })}
    </div>
  );
}
