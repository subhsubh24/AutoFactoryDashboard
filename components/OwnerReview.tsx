import Link from "next/link";
import type { NeedGroup, OwnerReview as OwnerReviewData, ReviewBucket } from "@/lib/aggregate";
import type { BacklogSummary } from "@/lib/narrative";
import { cn, type Tone } from "@/lib/utils";
import {
  AlertIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  RefreshIcon,
  RocketIcon,
  SparkleIcon,
} from "@/components/icons";

/**
 * The owner review, in two tiers. "Needs you" is the time-sensitive set — a
 * 5-minute morning pass covers it without opening a project tile:
 *   Urgent · Ship it · Unblock the loop · Approve.
 * The routine hands-on chores live in a separate, calmer "Backlog" (rendered by
 * OwnerBacklog) that collapses PER PROJECT → by type, so a long list stays
 * scannable and never inflates the "needs you now" badge. Identical tasks across
 * projects are clustered upstream.
 */

const META: Record<
  ReviewBucket,
  { label: string; hint: string; icon: typeof RocketIcon; tone: Tone }
> = {
  urgent: { label: "Urgent", hint: "confirmed risk — clear it now", icon: AlertIcon, tone: "clay" },
  ship: { label: "Ship it", hint: "cleared the gate — your sign-off ships it", icon: RocketIcon, tone: "sage" },
  unblock: { label: "Unblock the loop", hint: "stopping the factory from moving", icon: RefreshIcon, tone: "clay" },
  approve: { label: "Approve", hint: "quick yes / no calls", icon: SparkleIcon, tone: "amber" },
  do: { label: "Backlog", hint: "hands-on owner chores", icon: ArrowRightIcon, tone: "muted" },
};

const DOT: Record<Tone, string> = {
  sage: "bg-sage",
  clay: "bg-clay",
  amber: "bg-amber",
  muted: "bg-muted",
};

// Static (Tailwind JIT can't see a `text-${tone}` template literal).
const ICON_COLOR: Record<Tone, string> = {
  sage: "text-sage",
  clay: "text-clay",
  amber: "text-amber",
  muted: "text-muted",
};

// Task-type labels + the order they read in (higher-stakes first).
const TAG_LABEL: Record<string, string> = {
  security: "Security",
  billing: "Billing",
  deploy: "Deploy",
  store: "App store",
  data: "Data",
  ci: "CI",
  growth: "Growth",
  ops: "Ops",
};
const TAG_ORDER = ["security", "billing", "deploy", "store", "data", "ci", "growth", "ops"];
const tagRank = (t: string) => {
  const i = TAG_ORDER.indexOf(t);
  return i === -1 ? TAG_ORDER.length : i;
};

/** Group a project's tasks by type, higher-stakes types first. */
function byType(groups: NeedGroup[]): { tag: string; groups: NeedGroup[] }[] {
  const m = new Map<string, NeedGroup[]>();
  for (const g of groups) {
    const t = g.tag ?? "ops";
    const arr = m.get(t);
    if (arr) arr.push(g);
    else m.set(t, [g]);
  }
  return [...m.entries()]
    .map(([tag, gs]) => ({ tag, groups: gs }))
    .sort((a, b) => tagRank(a.tag) - tagRank(b.tag));
}

/** Split the Do bucket into per-project sections, heaviest first. A task that
 *  spans several projects is filed under its primary (highest-priority) one. */
function organizeDo(groups: NeedGroup[]) {
  const byProject = new Map<string, { name: string; groups: NeedGroup[] }>();
  for (const g of groups) {
    const primary = g.members[0]; // members are priority-sorted, distinct projects
    const e = byProject.get(primary.projectSlug);
    if (e) e.groups.push(g);
    else byProject.set(primary.projectSlug, { name: primary.projectName, groups: [g] });
  }
  return [...byProject.entries()]
    .map(([slug, e]) => ({ slug, name: e.name, groups: e.groups, byType: byType(e.groups) }))
    .sort((a, b) => b.groups.length - a.groups.length);
}

function ReviewRow({
  group,
  tone,
  showProject = true,
}: {
  group: NeedGroup;
  tone: Tone;
  /** Off when the row already sits under a project header. */
  showProject?: boolean;
}) {
  const projects = Array.from(
    new Map(group.members.map((m) => [m.projectSlug, m])).values(),
  );
  const multi = projects.length > 1;
  const single = projects[0];

  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        {showProject &&
          (multi ? (
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
          ))}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm leading-snug text-ink">{group.text}</p>
          {group.tag && showProject && (
            <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] font-medium text-muted">
              {group.tag}
            </span>
          )}
        </div>
        {group.howTo && <p className="mt-0.5 text-xs leading-snug text-muted">{group.howTo}</p>}
        {multi && showProject && (
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

/** A collapsible per-type group: "Security · 2" → the tasks. */
function TypeDetails({
  tag,
  groups,
  showProject,
}: {
  tag: string;
  groups: NeedGroup[];
  showProject: boolean;
}) {
  return (
    <details className="group border-b border-hairline last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-2.5">
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-ink">{TAG_LABEL[tag] ?? tag}</span>
          <span className="text-xs tabular text-muted">{groups.length}</span>
        </span>
        <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90" />
      </summary>
      <ul className="divide-y divide-hairline border-t border-hairline pb-1.5">
        {groups.map((g) => (
          <ReviewRow key={g.id} group={g} tone="muted" showProject={showProject} />
        ))}
      </ul>
    </details>
  );
}

/** The Do bucket — a collapsible tree so a long backlog stays scannable. On a
 *  single project (the project page) it collapses BY TYPE; across the fleet (the
 *  Floor) it's a two-level tree: Project → Type → tasks, each level its own
 *  independent collapsible. */
function DoBucket({ groups }: { groups: NeedGroup[] }) {
  const sections = organizeDo(groups);
  // Single project (project page) → group directly by type, no redundant wrapper.
  if (sections.length === 1) {
    return (
      <div className="mt-1.5 border-t border-hairline">
        {sections[0].byType.map((t) => (
          <TypeDetails key={t.tag} tag={t.tag} groups={t.groups} showProject={false} />
        ))}
      </div>
    );
  }
  return (
    <div className="mt-1.5 border-t border-hairline">
      {sections.map((proj) => (
        <details key={proj.slug} className="group/proj border-b border-hairline last:border-b-0">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-2.5">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[13px] font-medium text-ink">{proj.name}</span>
              <span className="text-xs tabular text-muted">{proj.groups.length}</span>
              <span className="hidden flex-wrap gap-1 sm:flex">
                {proj.byType.map((t) => (
                  <span
                    key={t.tag}
                    className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-muted"
                  >
                    {TAG_LABEL[t.tag] ?? t.tag} {t.groups.length}
                  </span>
                ))}
              </span>
            </span>
            <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted transition-transform group-open/proj:rotate-90" />
          </summary>
          <div className="border-t border-hairline pl-3">
            {proj.byType.map((t) => (
              <TypeDetails key={t.tag} tag={t.tag} groups={t.groups} showProject={false} />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

export function OwnerActionsMini({
  groups,
  slug,
  limit = 2,
  backlogCount = 0,
}: {
  groups: NeedGroup[];
  slug: string;
  limit?: number;
  /** Routine chores for this project — shown as a calm footer, not an alarm. */
  backlogCount?: number;
}) {
  if (groups.length === 0 && backlogCount === 0) return null;
  // Only routine chores (nothing time-sensitive) → a quiet one-liner, no clay.
  if (groups.length === 0) {
    return (
      <Link
        href={`/p/${slug}`}
        className="flex items-center gap-1.5 rounded-xl border border-hairline bg-bg/40 px-3 py-2 text-[12px] text-muted transition-colors hover:text-clay"
      >
        <ArrowRightIcon className="h-3 w-3 shrink-0" />
        {backlogCount} hands-on {backlogCount === 1 ? "chore" : "chores"} in the backlog
      </Link>
    );
  }
  const shown = groups.slice(0, limit);
  const more = groups.length - shown.length;
  return (
    <div className="rounded-xl border border-clay/20 bg-clay-soft/40 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-clay-strong">
        Needs you now <span className="tabular">· {groups.length}</span>
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {shown.map((g) => (
          <li key={g.id} className="flex items-start gap-1.5 text-[13px] leading-snug text-ink">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-clay" aria-hidden />
            <span>{g.text}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {more > 0 && (
          <Link
            href={`/p/${slug}`}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-clay-strong transition-colors hover:underline"
          >
            +{more} more <ArrowRightIcon className="h-3 w-3" />
          </Link>
        )}
        {backlogCount > 0 && (
          <span className="text-[11px] text-muted">
            · {backlogCount} in backlog
          </span>
        )}
      </div>
    </div>
  );
}

/** The time-sensitive tier — urgent / ship / unblock / approve, each a short
 *  flat list. The routine chores render separately via <OwnerBacklog>. */
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
                <Icon className={cn("h-3.5 w-3.5", ICON_COLOR[meta.tone])} />
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

/**
 * The routine hands-on backlog — the same tasks, split off from the "needs you
 * now" tier so the badge stays honest. Leads with a one-line AI read of what the
 * pile is about, then the collapsible Project → Type → tasks tree.
 */
export function OwnerBacklog({
  groups,
  summary,
}: {
  groups: NeedGroup[];
  summary?: BacklogSummary | null;
}) {
  if (groups.length === 0) return null;
  return (
    <div>
      {summary && (
        <p className="flex items-start gap-1.5 text-[13px] leading-snug text-muted">
          <SparkleIcon className="mt-0.5 h-3 w-3 shrink-0 text-muted" aria-hidden />
          <span>
            {summary.text}
            {summary.source === "llm" && <span className="ml-1 text-[10px] uppercase tracking-wide text-muted/70">AI</span>}
          </span>
        </p>
      )}
      <DoBucket groups={groups} />
    </div>
  );
}
