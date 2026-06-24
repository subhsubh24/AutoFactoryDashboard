import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PROJECTS, getProjectBySlug } from "@/config/projects";
import { getProjectSnapshot } from "@/lib/github";
import { getNarrative } from "@/lib/narrative";
import { getHistory } from "@/lib/kv";
import type { FeedEntry, ProjectSnapshot } from "@/lib/types";
import {
  cn,
  describeBlock,
  formatAge,
  headlinePct,
  kindLabel,
  nextMilestone,
  pluralize,
  toneClasses,
} from "@/lib/utils";
import { SectionCard } from "@/components/Section";
import { ProgressRing } from "@/components/ProgressRing";
import { StatusBadge } from "@/components/StatusBadge";
import { TrackBars } from "@/components/TrackBars";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ActionItemsPanel } from "@/components/ActionItemsPanel";
import { CIHealth } from "@/components/CIHealth";
import { HistoryCharts } from "@/components/HistoryCharts";
import { RelativeTime } from "@/components/RelativeTime";
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  GitCommitIcon,
  MergeIcon,
  PullRequestIcon,
  RocketIcon,
  SparkleIcon,
} from "@/components/icons";

export const revalidate = 600;
// Projects are a fixed config list — only configured slugs are valid routes;
// anything else is a real 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  return { title: project ? project.displayName : "Project" };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) notFound();

  const snapshot = await getProjectSnapshot(project);
  const [narrative, history] = await Promise.all([
    getNarrative(snapshot),
    getHistory(slug),
  ]);

  const pct = headlinePct(snapshot);
  const ringTone = snapshot.status === "ready" || pct === 100 ? "sage" : "clay";
  const milestone = nextMilestone(snapshot);
  const blockReason = describeBlock(snapshot);

  const projectFeed: FeedEntry[] = snapshot.merged7dItems.map((pr) => ({
    ...pr,
    projectSlug: snapshot.slug,
    projectName: snapshot.displayName,
    ci: snapshot.ci.status,
  }));
  const dayAgo = Date.now() - 24 * 3_600_000;
  const shipped24h = projectFeed.filter(
    (e) => e.mergedAt && Date.parse(e.mergedAt) >= dayAgo,
  );
  const shippedList = shipped24h.length > 0 ? shipped24h : projectFeed.slice(0, 6);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-clay"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Factory Floor
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-serif text-3xl font-medium tracking-tight text-ink">
                {snapshot.displayName}
              </h1>
              <StatusBadge status={snapshot.status} />
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span>{kindLabel(snapshot.kind)}</span>
              <span aria-hidden>·</span>
              <a
                href={snapshot.branchUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono transition-colors hover:text-clay"
              >
                {snapshot.workingBranch}
              </a>
              {snapshot.repoMeta.visibility && (
                <>
                  <span aria-hidden>·</span>
                  <span className="capitalize">{snapshot.repoMeta.visibility}</span>
                </>
              )}
              <span aria-hidden>·</span>
              <a
                href={snapshot.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-clay"
              >
                repo <ExternalLinkIcon className="h-3 w-3" />
              </a>
            </p>
          </div>
          <div className="text-right text-xs text-muted">
            <RelativeTime iso={snapshot.fetchedAt} prefix="Updated " />
          </div>
        </div>
      </div>

      {/* Ready-to-ship banner */}
      {snapshot.readyForSubmission && (
        <div className="mb-6 rounded-2xl border border-sage/30 bg-sage-soft/60 p-5">
          <div className="flex items-center gap-2 text-sage">
            <RocketIcon className="h-5 w-5" />
            <h2 className="font-serif text-lg font-medium">Ready for submission</h2>
          </div>
          <p className="mt-1 text-sm text-ink">
            The agent flagged this project ready to ship. Here&apos;s the
            human-core checklist to take it over the line.
          </p>
          <div className="mt-4">
            {snapshot.ready.checklist.length > 0 ? (
              <ActionItemsPanel
                info={{ available: true, items: snapshot.ready.checklist }}
                storageKey={`afd-ready-${slug}`}
                accent="sage"
              />
            ) : (
              <a
                href={snapshot.ready.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-sage-strong hover:underline"
              >
                Open the submission issue <ExternalLinkIcon className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="mb-6 card flex flex-col items-center gap-6 p-6 shadow-card sm:flex-row sm:gap-8 sm:p-7">
        <ProgressRing
          value={pct}
          size={156}
          stroke={13}
          tone={ringTone}
          label="to submission"
        />
        <div className="flex-1">
          {!snapshot.progress.available && (
            <p className="mb-3 text-sm text-muted">
              {snapshot.progress.reason ?? "ROADMAP.md not found"} — progress is
              estimated from available data.
            </p>
          )}
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Next milestone
          </p>
          <p className="mt-1 font-serif text-2xl text-ink">
            {milestone ?? (snapshot.progress.tracks.length ? "All tracks complete" : "—")}
          </p>
          {blockReason && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-clay-soft px-2.5 py-1 text-xs font-medium text-clay-strong">
              {blockReason}
            </p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <HeroStat label="Merged 24h" value={snapshot.merged24h} />
            <HeroStat label="Merged 7d" value={snapshot.merged7d} />
            <HeroStat
              label="Commits 25h"
              value={snapshot.commitsToday ?? "—"}
            />
            <HeroStat label="Open PRs" value={snapshot.openPRs.length} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        {/* Main column */}
        <div className="space-y-6">
          <SectionCard
            title="Last 24 hours"
            subtitle="What the agent shipped"
            aside={
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  narrative.source === "llm"
                    ? "bg-clay-soft text-clay-strong"
                    : "bg-bg text-muted",
                )}
                title={
                  narrative.source === "llm"
                    ? `Generated by ${narrative.model} via OpenRouter`
                    : "Templated summary — set OPENROUTER_API_KEY for AI digests"
                }
              >
                <SparkleIcon className="h-3 w-3" />
                {narrative.source === "llm" ? "AI digest" : "Summary"}
              </span>
            }
          >
            <p className="text-[15px] leading-relaxed text-ink">
              {narrative.text}
            </p>
            <div className="mt-5 border-t border-hairline pt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {shipped24h.length > 0
                  ? "Shipped · last 24h"
                  : "No merges in the last 24h · most recent"}
              </p>
              <ActivityFeed
                entries={shippedList}
                emptyText="No merged pull requests yet."
              />
            </div>
          </SectionCard>

          <SectionCard title="Today (live)" subtitle="Right now on the working branch">
            <div className="grid gap-4 sm:grid-cols-2">
              <LiveStat
                icon={<MergeIcon className="h-4 w-4" />}
                label="Merged today"
                value={snapshot.mergedToday}
              />
              <LiveStat
                icon={<GitCommitIcon className="h-4 w-4" />}
                label="Commits (25h)"
                value={snapshot.commitsToday ?? "—"}
              />
              <div className="flex items-center justify-between rounded-xl border border-hairline bg-bg px-3.5 py-3">
                <span className="flex items-center gap-2 text-sm text-muted">
                  <span className="text-muted">CI</span>
                </span>
                <CIHealth ci={snapshot.ci} />
              </div>
              <LiveStat
                icon={<PullRequestIcon className="h-4 w-4" />}
                label="Open PRs"
                value={snapshot.openPRs.length}
                accent={snapshot.stuckPRs > 0 ? "clay" : undefined}
                sub={
                  snapshot.stuckPRs > 0
                    ? `${snapshot.stuckPRs} stuck`
                    : undefined
                }
              />
            </div>

            {snapshot.openPRs.length > 0 && (
              <div className="mt-4 border-t border-hairline pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Open pull requests
                </p>
                <ul className="space-y-1.5">
                  {snapshot.openPRs.slice(0, 8).map((pr) => (
                    <li
                      key={pr.number}
                      className="flex items-center justify-between gap-3"
                    >
                      <a
                        href={pr.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex min-w-0 items-center gap-2 text-sm text-ink transition-colors hover:text-clay"
                      >
                        <span className="shrink-0 text-xs tabular text-muted">
                          #{pr.number}
                        </span>
                        <span className="truncate">{pr.title}</span>
                        {pr.draft && (
                          <span className="shrink-0 rounded bg-bg px-1.5 py-0.5 text-[10px] text-muted">
                            draft
                          </span>
                        )}
                      </a>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular",
                          pr.stuck
                            ? "bg-clay-soft text-clay-strong"
                            : "bg-bg text-muted",
                        )}
                      >
                        {pr.stuck ? "stuck " : ""}
                        {formatAge(pr.ageHours)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {snapshot.lastActivityAt && (
              <p className="mt-4 text-xs text-muted">
                Last activity{" "}
                <RelativeTime iso={snapshot.lastActivityAt} className="text-ink" />
                .
              </p>
            )}
          </SectionCard>

          <SectionCard
            title="Roadmap tracks"
            subtitle={
              snapshot.progress.percentToSubmission !== null
                ? `${snapshot.progress.percentToSubmission}% of the Definition of Done complete`
                : "Per-track progress from ROADMAP.md"
            }
          >
            {snapshot.progress.available ? (
              <TrackBars tracks={snapshot.progress.tracks} />
            ) : (
              <p className="text-sm text-muted">
                {snapshot.progress.reason ??
                  "ROADMAP.md not found — no track data."}
              </p>
            )}
          </SectionCard>

          {history && history.length > 0 && (
            <SectionCard title="Trends" subtitle="Daily history from Vercel KV">
              <HistoryCharts metrics={history} />
            </SectionCard>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <SectionCard
            title="Action items"
            subtitle="From PENDING_OPS.md"
            aside={
              snapshot.actionItems.items.length > 0 ? (
                <span className="grid h-6 min-w-6 place-items-center rounded-full bg-clay px-1.5 text-xs font-semibold text-white">
                  {snapshot.actionItems.items.length}
                </span>
              ) : undefined
            }
          >
            <ActionItemsPanel
              info={snapshot.actionItems}
              storageKey={`afd-actions-${slug}`}
            />
          </SectionCard>

          <SectionCard title="Loop health" subtitle="Attention & harness signals">
            <LoopHealth snapshot={snapshot} />
          </SectionCard>

          <SectionCard title="Data sources" subtitle="What the dashboard found">
            <ul className="space-y-2 text-sm">
              <FileRow label="ROADMAP.md" present={snapshot.files.roadmap.available} />
              <FileRow
                label="PENDING_OPS.md"
                present={snapshot.files.pendingOps.available}
              />
              <FileRow
                label="IMPROVEMENT_LOG.md"
                present={snapshot.files.improvementLog.available}
                href={
                  snapshot.files.improvementLog.available
                    ? `${snapshot.repoUrl}/blob/${snapshot.workingBranch}/${snapshot.files.improvementLog.path}`
                    : undefined
                }
              />
              <FileRow
                label="loop-memory"
                present={snapshot.files.loopMemory.available}
                href={
                  snapshot.files.loopMemory.available
                    ? `${snapshot.repoUrl}/blob/${snapshot.workingBranch}/${snapshot.files.loopMemory.path}`
                    : undefined
                }
              />
            </ul>
            {snapshot.repoMeta.pushedAt && (
              <p className="mt-3 border-t border-hairline pt-3 text-xs text-muted">
                Repo last pushed{" "}
                <RelativeTime
                  iso={snapshot.repoMeta.pushedAt}
                  className="text-ink"
                />
                .
              </p>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular text-ink">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function LiveStat({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: "clay";
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-hairline bg-bg px-3.5 py-3">
      <span className="flex items-center gap-2 text-sm text-muted">
        <span className="text-muted">{icon}</span>
        {label}
      </span>
      <span className="text-right">
        <span
          className={cn(
            "text-lg font-semibold tabular",
            accent === "clay" ? "text-clay" : "text-ink",
          )}
        >
          {value}
        </span>
        {sub && <span className="ml-1 text-xs text-clay">{sub}</span>}
      </span>
    </div>
  );
}

function LoopHealth({ snapshot }: { snapshot: ProjectSnapshot }) {
  const shipping =
    snapshot.merged24h > 0 || (snapshot.commitsToday ?? 0) > 0;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "rounded-xl px-3 py-2.5 text-sm",
          shipping ? "bg-sage-soft text-sage-strong" : "bg-bg text-muted",
        )}
      >
        {shipping
          ? `Loop is shipping — ${snapshot.merged24h} ${pluralize(
              snapshot.merged24h,
              "PR",
            )} and ${snapshot.commitsToday ?? 0} ${pluralize(
              snapshot.commitsToday ?? 0,
              "commit",
            )} in the last day.`
          : "Loop looks idle — no PRs or commits in the last day."}
      </div>

      {snapshot.attentionIssues.length === 0 ? (
        <p className="text-sm text-muted">
          No open harness proposals, FYIs, or blockers.
        </p>
      ) : (
        <ul className="space-y-2">
          {snapshot.attentionIssues.map((issue) => {
            const tone =
              issue.kind === "blocker"
                ? toneClasses("clay")
                : issue.kind === "harness_proposal"
                  ? toneClasses("amber")
                  : toneClasses("muted");
            const label =
              issue.kind === "harness_proposal"
                ? "Proposal"
                : issue.kind === "blocker"
                  ? "Blocker"
                  : "FYI";
            return (
              <li key={issue.number} className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    tone.badge,
                  )}
                >
                  {label}
                </span>
                <a
                  href={issue.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 text-sm text-ink transition-colors hover:text-clay"
                >
                  <span className="line-clamp-2">{issue.title}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FileRow({
  label,
  present,
  href,
}: {
  label: string;
  present: boolean;
  href?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            present ? "bg-sage" : "bg-[var(--ring-track)]",
          )}
        />
        <span className={present ? "font-mono text-ink" : "font-mono text-muted"}>
          {label}
        </span>
      </span>
      {present ? (
        href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted transition-colors hover:text-clay"
          >
            view
          </a>
        ) : (
          <span className="text-xs text-sage-strong">found</span>
        )
      ) : (
        <span className="text-xs text-muted">absent</span>
      )}
    </li>
  );
}
