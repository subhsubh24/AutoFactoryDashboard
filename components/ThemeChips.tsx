import type { ThemeCount } from "@/lib/themes";
import { cn } from "@/lib/utils";

/** Small chips showing what a batch of PRs focused on, with counts. */
export function ThemeChips({
  themes,
  limit = 6,
  className,
}: {
  themes: ThemeCount[];
  limit?: number;
  className?: string;
}) {
  if (themes.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {themes.slice(0, limit).map((t) => (
        <span
          key={t.key}
          className="inline-flex items-center gap-1 rounded-full border border-hairline bg-bg px-2 py-0.5 text-[11px] text-muted"
        >
          {t.label}
          <span className="tabular font-semibold text-ink/70">{t.count}</span>
        </span>
      ))}
    </div>
  );
}
