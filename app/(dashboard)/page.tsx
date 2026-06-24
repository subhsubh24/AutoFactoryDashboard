import { getAllSnapshots } from "@/lib/github";
import { buildOverview } from "@/lib/aggregate";
import { pluralize } from "@/lib/utils";
import { StatCard } from "@/components/StatCard";
import { ProjectCard } from "@/components/ProjectCard";
import { WhatNeedsYou } from "@/components/WhatNeedsYou";
import { ActivityFeed } from "@/components/ActivityFeed";
import { SectionCard } from "@/components/Section";
import { RelativeTime } from "@/components/RelativeTime";
import {
  AlertIcon,
  CheckIcon,
  RocketIcon,
  SparkleIcon,
} from "@/components/icons";

// Near-real-time without hammering the GitHub API.
export const revalidate = 600;

export default async function OverviewPage() {
  const snapshots = await getAllSnapshots();
  const overview = buildOverview(snapshots);
  const tokenMissing = !process.env.GITHUB_TOKEN;
  const needCount = overview.needs.length;

  return (
    <div className="animate-fade-in">
      <PageHeader fetchedAt={overview.oldestFetchedAt} />

      {tokenMissing && (
        <div className="mb-6 rounded-xl border border-clay/30 bg-clay-soft px-4 py-3 text-sm text-clay">
          <strong className="font-semibold">No GITHUB_TOKEN set.</strong> The
          dashboard is showing empty state. Add a read-only GitHub token to{" "}
          <code className="font-mono text-xs">.env.local</code> (see the README)
          to load live data.
        </div>
      )}

      {/* Top stat strip */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Shipped today"
          value={overview.totalMergedToday}
          sublabel={`${pluralize(overview.totalMergedToday, "PR")} merged across all projects`}
          tone="sage"
          icon={<RocketIcon className="h-4 w-4" />}
        />
        <StatCard
          label="Needs you"
          value={needCount}
          sublabel={
            needCount === 0
              ? "nothing waiting on a human"
              : `${pluralize(needCount, "item")} across the factory`
          }
          tone={needCount > 0 ? "clay" : "sage"}
          icon={
            needCount > 0 ? (
              <AlertIcon className="h-4 w-4" />
            ) : (
              <SparkleIcon className="h-4 w-4" />
            )
          }
        />
        <StatCard
          label="CI health"
          value={overview.ci.total === 0 ? "—" : `${overview.ci.passing}/${overview.ci.total}`}
          sublabel={
            overview.ci.total === 0
              ? "no CI configured yet"
              : overview.ci.anyFailing
                ? `${overview.ci.failingNames.join(", ")} failing`
                : "all branches green"
          }
          tone={overview.ci.tone}
          icon={<CheckIcon className="h-4 w-4" />}
        />
      </div>

      {/* Main grid: projects + activity on the left, "what needs you" rail. */}
      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr] lg:items-start">
        <div className="order-2 space-y-6 lg:order-1">
          <section>
            <h2 className="mb-3 px-1 text-sm font-semibold tracking-tight text-ink">
              Projects
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {snapshots.map((s) => (
                <ProjectCard key={s.slug} snapshot={s} />
              ))}
            </div>
          </section>

          <SectionCard
            title="Activity"
            subtitle="Merged pull requests across all projects, newest first"
            bodyClassName="py-2"
          >
            <ActivityFeed entries={overview.feed} showProject limit={24} />
          </SectionCard>
        </div>

        <aside className="order-1 lg:order-2 lg:sticky lg:top-20">
          <SectionCard
            title={
              <span className="flex items-center gap-1.5">
                <SparkleIcon className="h-4 w-4 text-clay" />
                What needs you
              </span>
            }
            subtitle="Prioritized across every project"
            headerClassName="bg-clay-soft/40"
            aside={
              needCount > 0 ? (
                <span className="grid h-6 min-w-6 place-items-center rounded-full bg-clay px-1.5 text-xs font-semibold text-white">
                  {needCount}
                </span>
              ) : undefined
            }
            bodyClassName="max-h-[70vh] overflow-y-auto"
          >
            <WhatNeedsYou needs={overview.needs} />
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}

function PageHeader({ fetchedAt }: { fetchedAt: string | null }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          Autonomous product factory
        </p>
        <h1 className="mt-1 font-serif text-3xl font-medium tracking-tight text-ink sm:text-4xl">
          Factory Floor
        </h1>
      </div>
      <div className="text-right text-xs text-muted">
        <p>
          <RelativeTime iso={fetchedAt} prefix="Updated " />
        </p>
        <p className="mt-0.5 opacity-70">Auto-refreshes every 10 min</p>
      </div>
    </div>
  );
}
