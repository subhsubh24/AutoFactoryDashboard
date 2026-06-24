import Link from "next/link";
import { getAllSnapshots } from "@/lib/github";
import { buildOverview, humanAsksFor, type NeedEntry } from "@/lib/aggregate";
import type { ProjectSnapshot } from "@/lib/types";
import { cn, ciMeta, pluralize, statusMeta, toneClasses } from "@/lib/utils";
import { ActivityFeed } from "@/components/ActivityFeed";
import { RelativeTime } from "@/components/RelativeTime";
import { CalmCoda, Greeting } from "@/components/TimeAware";
import {
  ArrowRightIcon,
  CheckIcon,
  ExternalLinkIcon,
  RocketIcon,
} from "@/components/icons";

// Near-real-time without hammering the GitHub API.
export const revalidate = 600;

export default async function OverviewPage() {
  const snapshots = await getAllSnapshots();
  const overview = buildOverview(snapshots);
  const tokenMissing = !process.env.GITHUB_TOKEN;
  const authError =
    !tokenMissing &&
    snapshots.length > 0 &&
    snapshots.every((s) => !s.repoMeta.available) &&
    snapshots.some((s) => s.errors.some((e) => /HTTP 40[13]/.test(e)));

  const shipped = overview.totalMerged24h;
  const asks = overview.needs;
  const overnightCount = overview.overnightFeed.length;

  return (
    <div className="animate-fade-in mx-auto max-w-3xl">
      <Header fetchedAt={overview.oldestFetchedAt} />

      {tokenMissing && (
        <div className="mb-6 rounded-xl border border-clay/30 bg-clay-soft px-4 py-3 text-sm text-clay-strong">
          <strong className="font-semibold">No GITHUB_TOKEN set.</strong> Add a
          read-only GitHub token to{" "}
          <code className="font-mono text-xs">.env.local</code> (see the README)
          to load live data.
        </div>
      )}
      {authError && (
        <div className="mb-6 rounded-xl border border-amber/30 bg-amber-soft px-4 py-3 text-sm text-amber-strong">
          <strong className="font-semibold">GitHub rejected every request.</strong>{" "}
          Your <code className="font-mono text-xs">GITHUB_TOKEN</code> looks
          invalid or lacks read access to these repos.
        </div>
      )}

      {/* 1 — The one thing you came for: what shipped overnight. */}
      <section className="mb-6 rounded-2xl border border-hairline bg-card p-6 shadow-card sm:p-8">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
          <RocketIcon className="h-3.5 w-3.5 text-sage" />
          Shipped overnight
        </div>
        {shipped > 0 ? (
          <p className="mt-2 font-serif text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
            {shipped} {pluralize(shipped, "PR")} shipped
            <span className="text-muted">
              {" "}
              across {overview.projectsShippedOvernight}{" "}
              {pluralize(overview.projectsShippedOvernight, "project")}
            </span>
          </p>
        ) : (
          <p className="mt-2 font-serif text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
            Quiet night
            <span className="text-muted"> — nothing shipped in the last 24h</span>
          </p>
        )}

        <Verdict count={asks.length} />
      </section>

      {/* 2 — Only the things that genuinely need you. */}
      {asks.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 px-1 text-sm font-semibold tracking-tight text-ink">
            Needs you
          </h2>
          <ul className="space-y-2">
            {asks.map((need) => (
              <AskRow key={need.id} need={need} />
            ))}
          </ul>
        </section>
      )}

      {/* 3 — A calm one-line status per project. */}
      <section className="mb-6">
        <h2 className="mb-3 px-1 text-sm font-semibold tracking-tight text-ink">
          Projects
        </h2>
        <ul className="overflow-hidden rounded-2xl border border-hairline bg-card shadow-card divide-y divide-hairline">
          {snapshots.map((s) => (
            <GlanceRow key={s.slug} snapshot={s} />
          ))}
        </ul>
      </section>

      {/* 4 — The detail, kept out of the way until you want it. */}
      {overnightCount > 0 && (
        <details className="group rounded-2xl border border-hairline bg-card shadow-card">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-medium text-ink">
            <span>
              What shipped overnight{" "}
              <span className="text-muted">({overnightCount})</span>
            </span>
            <ArrowRightIcon className="h-4 w-4 text-muted transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t border-hairline px-5 py-2">
            <ActivityFeed
              entries={overview.overnightFeed}
              showProject
              limit={30}
            />
          </div>
        </details>
      )}
    </div>
  );
}

/** The single verdict line under the hero number. */
function Verdict({ count }: { count: number }) {
  if (count === 0) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-sage-soft/60 px-3.5 py-2.5 text-sm font-medium text-sage-strong">
        <CheckIcon className="h-4 w-4 shrink-0" />
        <CalmCoda />
      </div>
    );
  }
  return (
    <div className="mt-4 flex items-center gap-2 rounded-xl bg-clay-soft/70 px-3.5 py-2.5 text-sm font-medium text-clay-strong">
      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-clay px-1 text-xs font-semibold text-white">
        {count}
      </span>
      {count === 1 ? "thing needs" : "things need"} your attention this morning.
    </div>
  );
}

/** One true human ask, phrased plainly. */
function AskRow({ need }: { need: NeedEntry }) {
  const isReady = need.kind === "ready";
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3.5",
        isReady ? "border-sage/30 bg-sage-soft/50" : "border-clay/20 bg-card",
      )}
    >
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          isReady ? "bg-sage" : "bg-clay",
        )}
      />
      <div className="min-w-0 flex-1">
        <Link
          href={`/p/${need.projectSlug}`}
          className="text-[11px] font-semibold uppercase tracking-wide text-muted transition-colors hover:text-clay"
        >
          {need.projectName}
        </Link>
        <p className="text-sm leading-snug text-ink">{need.text}</p>
        {need.howTo && (
          <p className="mt-0.5 text-xs text-muted">{need.howTo}</p>
        )}
      </div>
      {need.url && (
        <a
          href={need.url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open on GitHub"
          className="mt-0.5 shrink-0 text-muted transition-colors hover:text-clay"
        >
          <ExternalLinkIcon className="h-4 w-4" />
        </a>
      )}
    </li>
  );
}

/** A calm, single-line project status. */
function GlanceRow({ snapshot: s }: { snapshot: ProjectSnapshot }) {
  const status = statusMeta(s.status);
  const ci = ciMeta(s.ci.status);
  const asks = humanAsksFor(s).length;
  const shipped = s.merged24h;

  return (
    <li>
      <Link
        href={`/p/${s.slug}`}
        className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-bg/60"
      >
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            toneClasses(status.tone).dot,
            status.live && "animate-pulse-soft",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-serif text-base font-medium text-ink">
            {s.displayName}
          </span>
          <span className="text-xs text-muted">
            {shipped > 0
              ? `${shipped} shipped overnight`
              : "nothing shipped overnight"}
          </span>
        </span>

        {asks > 0 ? (
          <span className="hidden shrink-0 rounded-full bg-clay-soft px-2 py-0.5 text-[11px] font-medium text-clay-strong sm:inline">
            needs you
          </span>
        ) : (
          <span
            className={cn(
              "hidden shrink-0 items-center gap-1.5 text-xs sm:flex",
              toneClasses(ci.tone).text,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", toneClasses(ci.tone).dot)} />
            CI {ci.label.toLowerCase()}
          </span>
        )}

        <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-clay" />
      </Link>
    </li>
  );
}

function Header({ fetchedAt }: { fetchedAt: string | null }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          Autonomous product factory
        </p>
        <h1 className="mt-1 font-serif text-3xl font-medium tracking-tight text-ink sm:text-4xl">
          <Greeting />
        </h1>
      </div>
      <p className="text-xs text-muted">
        <RelativeTime iso={fetchedAt} prefix="Updated " /> · refreshes every 10m
      </p>
    </div>
  );
}
