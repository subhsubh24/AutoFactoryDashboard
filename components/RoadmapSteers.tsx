import type { RoadmapSteer } from "@/lib/types";
import { RelativeTime } from "@/components/RelativeTime";

/**
 * Recent ROADMAP.md / VISION.md changes — the GTM-driven product-direction
 * steers, so the owner can see what the data is steering. Each links to the PR
 * (or the commit when no PR number is in the message). Empty → a calm note.
 */
export function RoadmapSteers({ steers }: { steers: RoadmapSteer[] }) {
  if (steers.length === 0) {
    return (
      <p className="text-sm text-muted">No recent roadmap or vision changes.</p>
    );
  }
  return (
    <ul className="space-y-2.5">
      {steers.map((s) => (
        <li
          key={`${s.file}-${s.prNumber ?? s.title}`}
          className="flex items-start justify-between gap-3"
        >
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="group flex min-w-0 items-start gap-2 text-sm text-ink transition-colors hover:text-clay"
          >
            <span className="mt-0.5 shrink-0 rounded bg-bg px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
              {s.file.replace(/\.md$/, "")}
            </span>
            <span className="line-clamp-2 min-w-0">{s.title}</span>
          </a>
          <span className="shrink-0 text-right text-[11px] text-muted">
            {s.prNumber !== null && <span className="tabular">#{s.prNumber}</span>}
            {s.date && (
              <span className="block">
                <RelativeTime iso={s.date} />
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
