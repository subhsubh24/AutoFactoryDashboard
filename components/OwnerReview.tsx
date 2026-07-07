import Link from "next/link";
import type { NeedGroup, OwnerReview as OwnerReviewData, ReviewBucket } from "@/lib/aggregate";
import { cn, type Tone } from "@/lib/utils";
import {
  AlertIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  RocketIcon,
  SparkleIcon,
} from "@/components/icons";

/**
 * "Needs you" — the whole morning review in one place. Everything genuinely
 * waiting on the owner, across every project, sorted into four buckets so a
 * 5-minute pass covers it without opening a single project tile:
 *   Ship it · Unblock the loop · Approve · Do.
 * Identical tasks across projects are already clustered into one row upstream.
 */

const META: Record<
  ReviewBucket,
  { label: string; hint: string; icon: typeof RocketIcon; tone: Tone }
> = {
  ship: {
    label: "Ship it",
    hint: "cleared the gate — your sign-off ships it",
    icon: RocketIcon,
    tone: "sage",
  },
  unblock: {
    label: "Unblock the loop",
    hint: "stopping the factory from moving",
    icon: AlertIcon,
    tone: "clay",
  },
  approve: {
    label: "Approve",
    hint: "quick yes / no calls",
    icon: SparkleIcon,
    tone: "amber",
  },
  do: {
    label: "Do",
    hint: "hands-on owner tasks",
    icon: ArrowRightIcon,
    tone: "muted",
  },
};

const DOT: Record<Tone, string> = {
  sage: "bg-sage",
  clay: "bg-clay",
  amber: "bg-amber",
  muted: "bg-muted",
};

function ReviewRow({ group, tone }: { group: NeedGroup; tone: Tone }) {
  // One chip per DISTINCT project (a clustered same-task group spans several).
  const projects = Array.from(
    new Map(group.members.map((m) => [m.projectSlug, m])).values(),
  );
  const multi = projects.length > 1;
  const single = projects[0];

  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        {multi ? (
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {projects.map((m) => (
              <Link
                key={m.projectSlug}
                href={`/p/${m.projectSlug}`}
                className="rounded-full bg-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted transition-colors hover:text-clay"
              >
                {m.projectName}
              </Link>
            ))}
            <span className="text-[10px] font-medium tabular text-muted">
              {projects.length} projects
            </span>
          </div>
        ) : (
          <Link
            href={`/p/${single.projectSlug}`}
            className="text-[11px] font-semibold uppercase tracking-wide text-muted transition-colors hover:text-clay"
          >
            {single.projectName}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm leading-snug text-ink">{group.text}</p>
          {group.tag && (
            <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] font-medium text-muted">
              {group.tag}
            </span>
          )}
        </div>
        {group.howTo && <p className="mt-0.5 text-xs leading-snug text-muted">{group.howTo}</p>}
        {multi && (
          <p className="mt-0.5 text-[11px] text-muted">Same task on each — do it once per project.</p>
        )}
      </div>
      {!multi && single.url && (
        <a
          href={single.url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open"
          className="mt-0.5 shrink-0 text-muted transition-colors hover:text-clay"
        >
          <ExternalLinkIcon className="h-4 w-4" />
        </a>
      )}
    </li>
  );
}

/**
 * Compact per-project "Needs you" for a Floor tile — the same owner-action list,
 * shrunk to the top items + a "more" link, so the tile mirrors the full section
 * on the project page. Full text (no truncation); overflow rolls into "+N more".
 */
export function OwnerActionsMini({
  groups,
  slug,
  limit = 2,
}: {
  groups: NeedGroup[];
  slug: string;
  limit?: number;
}) {
  if (groups.length === 0) return null;
  const shown = groups.slice(0, limit);
  const more = groups.length - shown.length;
  return (
    <div className="rounded-xl border border-clay/20 bg-clay-soft/40 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-clay-strong">
        Needs you <span className="tabular">· {groups.length}</span>
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {shown.map((g) => (
          <li key={g.id} className="flex items-start gap-1.5 text-[13px] leading-snug text-ink">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-clay" aria-hidden />
            <span>{g.text}</span>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <Link
          href={`/p/${slug}`}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-clay-strong transition-colors hover:underline"
        >
          +{more} more <ArrowRightIcon className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

export function OwnerReview({ review }: { review: OwnerReviewData }) {
  if (review.total === 0) return null; // caller renders the calm "all clear"
  return (
    <div className="space-y-5">
      {review.sections.map((section) => {
        const meta = META[section.key];
        const Icon = meta.icon;
        return (
          <div key={section.key}>
            <div className="flex items-baseline gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
                <Icon className={cn("h-3.5 w-3.5", `text-${meta.tone === "muted" ? "muted" : meta.tone}`)} />
                {meta.label}
                <span className="tabular text-muted">{section.groups.length}</span>
              </p>
              <span className="text-[11px] text-muted">· {meta.hint}</span>
            </div>
            <ul className="mt-1.5 divide-y divide-hairline border-t border-hairline pt-1">
              {section.groups.map((g) => (
                <ReviewRow key={g.id} group={g} tone={meta.tone} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
