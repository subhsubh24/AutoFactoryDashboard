import { Sparkline } from "@/components/Sparkline";
import { cn } from "@/lib/utils";

export interface ProjectTrend {
  slug: string;
  name: string;
  /** Live current % to launch (null when there's no roadmap %). */
  current: number | null;
  /** Historical % series, oldest → newest (gaps allowed). */
  values: Array<number | null>;
}

function definedValues(values: Array<number | null>): number[] {
  return values.filter((v): v is number => v !== null);
}

/**
 * Cross-project "progress to launch": a prominent bar per project from the live
 * %, with a trend sparkline layered in once a couple of days of KV history
 * exist. Always shows something useful, even with zero history.
 */
export function ProgressTrend({ trends }: { trends: ProjectTrend[] }) {
  return (
    <ul className="space-y-5">
      {trends.map((t) => {
        const defined = definedValues(t.values);
        const delta =
          defined.length >= 2 ? defined[defined.length - 1] - defined[0] : null;
        const pct = t.current ?? 0;

        return (
          <li key={t.slug}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium text-ink">
                {t.name}
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="font-serif text-2xl font-medium leading-none tabular text-ink">
                  {t.current === null ? "—" : `${t.current}%`}
                </span>
                {delta !== null && delta !== 0 && (
                  <span
                    className={cn(
                      "text-xs font-medium tabular",
                      delta > 0 ? "text-sage-strong" : "text-clay-strong",
                    )}
                  >
                    {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                  </span>
                )}
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-hairline">
              <div
                className="h-full rounded-full bg-sage transition-all"
                style={{ width: `${Math.max(pct, 1.5)}%` }}
              />
            </div>
            {defined.length >= 2 && (
              <div className="mt-2">
                <Sparkline
                  values={t.values}
                  tone="sage"
                  max={100}
                  height={32}
                  className="h-8 w-full"
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
