import Link from "next/link";
import type { FeedEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CIDot } from "@/components/CIHealth";
import { RelativeTime } from "@/components/RelativeTime";
import { ExternalLinkIcon, MergeIcon } from "@/components/icons";

export function TrackChip({ track }: { track?: string | null }) {
  if (!track) return null;
  return (
    <span className="shrink-0 rounded-md bg-clay-soft px-1.5 py-0.5 text-[10px] font-medium text-clay">
      {track}
    </span>
  );
}

/**
 * Unified merged-PR feed. With `showProject`, prefixes each row with a project
 * tag (used on the overview); without it, the feed is for a single project.
 */
export function ActivityFeed({
  entries,
  showProject = false,
  limit,
  emptyText = "No merged pull requests in the last 7 days.",
}: {
  entries: FeedEntry[];
  showProject?: boolean;
  limit?: number;
  emptyText?: string;
}) {
  const rows = limit ? entries.slice(0, limit) : entries;

  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted">
        <MergeIcon className="h-4 w-4" />
        {emptyText}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-hairline">
      {rows.map((entry) => (
        <li
          key={`${entry.projectSlug}-${entry.number}`}
          className="flex items-center gap-3 py-2.5"
        >
          <CIDot status={entry.ci} className="shrink-0" />
          <RelativeTime
            iso={entry.mergedAt}
            className="w-16 shrink-0 text-xs tabular text-muted"
          />
          {showProject && (
            <Link
              href={`/p/${entry.projectSlug}`}
              className="hidden w-28 shrink-0 truncate text-xs font-medium text-muted transition-colors hover:text-clay sm:block"
            >
              {entry.projectName}
            </Link>
          )}
          <span className="shrink-0 text-xs tabular text-muted">
            #{entry.number}
          </span>
          <a
            href={entry.url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "group flex min-w-0 flex-1 items-center gap-2 text-sm text-ink",
              "transition-colors hover:text-clay",
            )}
          >
            <span className="truncate">{entry.title}</span>
            <ExternalLinkIcon className="h-3 w-3 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
          <TrackChip track={entry.track} />
        </li>
      ))}
    </ul>
  );
}
