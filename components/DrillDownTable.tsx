import type { DrillPr } from "@/lib/aggregate";
import { RelativeTime } from "@/components/RelativeTime";
import { ArrowRightIcon, ExternalLinkIcon } from "@/components/icons";

/**
 * The drill-down body for a chart mark (a WeekBars day or a donut slice): the
 * underlying PRs grouped by project, heaviest first — a ranked breakdown you scan
 * at a glance (name · mini bar · count), each project expandable to its individual
 * PRs (linked to GitHub, newest first). Few projects → expanded; many → collapsed.
 */
export function DrillDownTable({ rows }: { rows: DrillPr[] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">No pull requests here.</p>;
  }

  const byProject = new Map<string, DrillPr[]>();
  for (const r of rows) {
    const arr = byProject.get(r.projectSlug);
    if (arr) arr.push(r);
    else byProject.set(r.projectSlug, [r]);
  }
  const groups = [...byProject.entries()]
    .map(([slug, prs]) => ({ slug, name: prs[0].projectName, prs }))
    .sort((a, b) => b.prs.length - a.prs.length);
  const max = Math.max(1, ...groups.map((g) => g.prs.length));
  const collapsed = groups.length > 4 || rows.length > 20;

  return (
    <ul className="divide-y divide-hairline">
      {groups.map((g) => (
        <li key={g.slug}>
          <details className="group" open={!collapsed}>
            <summary className="flex cursor-pointer list-none items-center gap-3 py-2.5">
              <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-open:rotate-90" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                {g.name}
              </span>
              <span
                className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-bg sm:block"
                aria-hidden
              >
                <span
                  className="block h-full rounded-full bg-sage"
                  style={{ width: `${(g.prs.length / max) * 100}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-sm font-semibold tabular text-ink">
                {g.prs.length}
              </span>
            </summary>
            <ul className="pb-2 pl-6">
              {[...g.prs]
                .sort((a, b) => Date.parse(b.mergedAt ?? "") - Date.parse(a.mergedAt ?? ""))
                .map((pr) => (
                  <li key={pr.number} className="flex items-start justify-between gap-3">
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group/pr flex min-w-0 flex-1 items-start gap-1.5 py-1 text-[13px] leading-snug text-ink transition-colors hover:text-clay"
                    >
                      <span className="mt-px shrink-0 text-[11px] tabular text-muted">
                        #{pr.number}
                      </span>
                      <span className="min-w-0">{pr.title}</span>
                      <ExternalLinkIcon className="mt-0.5 h-3 w-3 shrink-0 text-muted opacity-0 transition-opacity group-hover/pr:opacity-100" />
                    </a>
                    <span className="shrink-0 py-1 text-[11px] tabular text-muted">
                      <RelativeTime iso={pr.mergedAt} />
                    </span>
                  </li>
                ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}
