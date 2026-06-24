import { Sparkline } from "@/components/Sparkline";

export interface ProjectTrend {
  slug: string;
  name: string;
  /** Live current % to submission (null when there's no roadmap %). */
  current: number | null;
  /** Historical % series, oldest → newest (gaps allowed). */
  values: Array<number | null>;
}

function definedValues(values: Array<number | null>): number[] {
  return values.filter((v): v is number => v !== null);
}

/**
 * Cross-project "progress to launch over time": one row per project with the
 * live % and a sparkline of its historical % to submission. Degrades cleanly
 * with a single data point (the line fills in as the daily snapshot runs).
 */
export function ProgressTrend({ trends }: { trends: ProjectTrend[] }) {
  return (
    <ul className="divide-y divide-hairline">
      {trends.map((t) => {
        const defined = definedValues(t.values);
        const delta =
          defined.length >= 2 ? defined[defined.length - 1] - defined[0] : null;

        return (
          <li key={t.slug} className="flex items-center gap-3 py-3 sm:gap-4">
            <span className="w-24 shrink-0 truncate text-sm font-medium text-ink sm:w-32">
              {t.name}
            </span>
            <span className="w-11 shrink-0 text-right text-lg font-semibold tabular text-ink">
              {t.current === null ? "—" : `${t.current}%`}
            </span>
            <div className="min-w-0 flex-1">
              {defined.length > 0 ? (
                <Sparkline
                  values={t.values}
                  tone="sage"
                  max={100}
                  height={36}
                  className="h-9 w-full"
                />
              ) : (
                <span className="text-xs text-muted">no roadmap %</span>
              )}
            </div>
            <span className="w-12 shrink-0 text-right text-xs tabular">
              {delta === null ? (
                <span className="text-muted">·</span>
              ) : delta > 0 ? (
                <span className="text-sage-strong">▲{delta}</span>
              ) : delta < 0 ? (
                <span className="text-clay-strong">▼{Math.abs(delta)}</span>
              ) : (
                <span className="text-muted">±0</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
