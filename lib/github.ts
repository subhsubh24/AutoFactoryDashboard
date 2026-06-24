import { Octokit } from "@octokit/rest";
import { unstable_cache } from "next/cache";
import type { ProjectConfig } from "@/config/projects";
import { PROJECTS } from "@/config/projects";
import {
  extractDoneAnnotations,
  extractTrackCodes,
  finalizeProgress,
  parsePendingOps,
  parseReadyChecklist,
  parseRoadmap,
  parseTrackFromText,
} from "@/lib/parsers";
import type {
  AttentionIssue,
  AttentionKind,
  CIInfo,
  PRItem,
  ProjectSnapshot,
  ProjectStatus,
  RawFile,
  RepoMeta,
} from "@/lib/types";

/** Revalidate snapshots roughly every 10 minutes (ISR). */
export const SNAPSHOT_REVALIDATE_SECONDS = 600;

const STUCK_PR_HOURS = 12;
const READY_TITLE = "factory: ready for submission";

// ────────────────────────────────────────────────────────────────────────────
// Octokit
// ────────────────────────────────────────────────────────────────────────────

function getOctokit(): Octokit | null {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  return new Octokit({
    auth: token,
    userAgent: "AutoFactoryDashboard",
    request: {
      // Keep individual calls from hanging the whole render.
      fetch: (url: string, opts: RequestInit) =>
        fetch(url, { ...opts, signal: AbortSignal.timeout(15000) }),
    },
  });
}

function errorMessage(e: unknown): string {
  if (e && typeof e === "object") {
    const any = e as { status?: number; message?: string };
    if (any.status === 403 && /rate limit/i.test(any.message ?? "")) {
      return "GitHub rate limit reached";
    }
    if (any.status) return `HTTP ${any.status}${any.message ? `: ${any.message}` : ""}`;
    if (any.message) return any.message;
  }
  return String(e);
}

function statusCode(e: unknown): number | undefined {
  return (e as { status?: number } | null)?.status;
}

// ────────────────────────────────────────────────────────────────────────────
// Time helpers
// ────────────────────────────────────────────────────────────────────────────

function hoursAgo(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3_600_000;
}

function withinHours(iso: string | null | undefined, hours: number): boolean {
  const h = hoursAgo(iso);
  return h !== null && h <= hours;
}

function isTodayUtc(iso?: string | null): boolean {
  if (!iso) return false;
  const today = new Date().toISOString().slice(0, 10);
  return iso.slice(0, 10) === today;
}

function maxIso(...isos: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestT = -Infinity;
  for (const iso of isos) {
    if (!iso) continue;
    const t = Date.parse(iso);
    if (!Number.isNaN(t) && t > bestT) {
      bestT = t;
      best = iso;
    }
  }
  return best;
}

// ────────────────────────────────────────────────────────────────────────────
// Per-area fetchers (each defensive; never throws)
// ────────────────────────────────────────────────────────────────────────────

interface PullsResult {
  mergedToday: number;
  merged24h: number;
  merged7d: number;
  merged7dItems: PRItem[];
  recentMerged: PRItem[];
  openPRs: PRItem[];
  stuckPRs: number;
  latestMergedAt: string | null;
  latestOpenUpdatedAt: string | null;
  /** Distinct sub-track codes (A1, B2…) referenced across ALL merged PRs. */
  mergedCodes: string[];
}

async function fetchPulls(
  octokit: Octokit,
  owner: string,
  repo: string,
  errors: string[],
): Promise<PullsResult | null> {
  try {
    // Sorted by updated desc; two pages cover ~a week of an hourly factory.
    const collected: Awaited<
      ReturnType<Octokit["rest"]["pulls"]["list"]>
    >["data"] = [];
    for (let page = 1; page <= 2; page++) {
      const { data } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: "all",
        sort: "updated",
        direction: "desc",
        per_page: 100,
        page,
      });
      collected.push(...data);
      if (data.length < 100) break;
    }

    const toItem = (pr: (typeof collected)[number]): PRItem => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      author: pr.user?.login,
      mergedAt: pr.merged_at ?? undefined,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      draft: pr.draft ?? false,
      track: parseTrackFromText(pr.title, pr.body),
    });

    const merged = collected
      .filter((pr) => pr.merged_at)
      .map(toItem)
      .sort((a, b) => Date.parse(b.mergedAt!) - Date.parse(a.mergedAt!));

    const open = collected
      .filter((pr) => pr.state === "open")
      .map((pr) => {
        const item = toItem(pr);
        const age = hoursAgo(pr.created_at);
        item.ageHours = age ?? undefined;
        item.stuck = age !== null && age > STUCK_PR_HOURS;
        return item;
      })
      .sort((a, b) => (b.ageHours ?? 0) - (a.ageHours ?? 0));

    const merged7dItems = merged.filter((m) => withinHours(m.mergedAt, 24 * 7));

    // Codes from every merged PR (title + body) — drives sub-track coverage.
    const mergedCodes = [
      ...new Set(
        collected
          .filter((pr) => pr.merged_at)
          .flatMap((pr) => extractTrackCodes(`${pr.title}\n${pr.body ?? ""}`)),
      ),
    ];

    return {
      mergedToday: merged.filter((m) => isTodayUtc(m.mergedAt)).length,
      merged24h: merged.filter((m) => withinHours(m.mergedAt, 24)).length,
      merged7d: merged7dItems.length,
      merged7dItems,
      recentMerged: merged.slice(0, 10),
      openPRs: open,
      stuckPRs: open.filter((p) => p.stuck).length,
      latestMergedAt: merged[0]?.mergedAt ?? null,
      latestOpenUpdatedAt: open[0]?.updatedAt ?? null,
      mergedCodes,
    };
  } catch (e) {
    errors.push(`pull requests: ${errorMessage(e)}`);
    return null;
  }
}

async function fetchCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  errors: string[],
): Promise<{ count: number; latest: string | null } | null> {
  const since = new Date(Date.now() - 25 * 3_600_000).toISOString();
  try {
    const { data } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: branch,
      since,
      per_page: 100,
    });
    return {
      count: data.length,
      latest: data[0]?.commit?.author?.date ?? data[0]?.commit?.committer?.date ?? null,
    };
  } catch (e) {
    // 409 = empty repo; 404 = branch missing. Both are "no commits", not errors.
    const code = statusCode(e);
    if (code === 409 || code === 404) return { count: 0, latest: null };
    errors.push(`commits: ${errorMessage(e)}`);
    return null;
  }
}

interface IssuesResult {
  readyIssue: { url: string; body: string | null } | null;
  attentionIssues: AttentionIssue[];
}

function classifyAttention(
  title: string,
  labels: string[],
): AttentionKind | null {
  if (/^\s*loop:\s*harness improvement proposal/i.test(title)) {
    return "harness_proposal";
  }
  if (/^\s*fyi\b/i.test(title) || labels.includes("fyi")) return "fyi";
  if (/\bblocker\b/i.test(title) || labels.some((l) => /blocker|needs[\s-]*human/i.test(l))) {
    return "blocker";
  }
  return null;
}

async function fetchIssues(
  octokit: Octokit,
  owner: string,
  repo: string,
  errors: string[],
): Promise<IssuesResult | null> {
  try {
    const { data } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: "open",
      per_page: 100,
    });
    let readyIssue: IssuesResult["readyIssue"] = null;
    const attentionIssues: AttentionIssue[] = [];

    for (const issue of data) {
      // listForRepo returns PRs too — skip them.
      if (issue.pull_request) continue;
      const title = (issue.title ?? "").trim();
      const labels = (issue.labels ?? []).map((l) =>
        typeof l === "string" ? l : (l.name ?? ""),
      );

      if (title.toLowerCase() === READY_TITLE) {
        readyIssue = { url: issue.html_url, body: issue.body ?? null };
        continue;
      }

      const kind = classifyAttention(title, labels);
      if (kind) {
        attentionIssues.push({
          number: issue.number,
          title,
          url: issue.html_url,
          kind,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
        });
      }
    }

    return { readyIssue, attentionIssues };
  } catch (e) {
    errors.push(`issues: ${errorMessage(e)}`);
    return null;
  }
}

const CI_FAIL = new Set(["failure", "timed_out", "startup_failure"]);

async function fetchCI(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  repoUrl: string,
  errors: string[],
): Promise<CIInfo> {
  try {
    const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      branch,
      per_page: 20,
    });
    const runs = data.workflow_runs ?? [];
    if (runs.length === 0) {
      return {
        available: true,
        status: "none",
        passRate: null,
        totalRuns: 0,
        reason: "No GitHub Actions runs on this branch yet.",
        url: `${repoUrl}/actions`,
      };
    }

    const latest = runs[0];
    let status: CIInfo["status"];
    if (latest.status !== "completed") status = "pending";
    else if (latest.conclusion === "success") status = "passing";
    else if (CI_FAIL.has(latest.conclusion ?? "")) status = "failing";
    else status = "unknown";

    let pass = 0;
    let fail = 0;
    for (const r of runs) {
      if (r.status !== "completed") continue;
      if (r.conclusion === "success") pass++;
      else if (CI_FAIL.has(r.conclusion ?? "")) fail++;
    }
    const passRate = pass + fail > 0 ? Math.round((pass / (pass + fail)) * 100) : null;

    return {
      available: true,
      status,
      passRate,
      totalRuns: runs.length,
      lastRunAt: latest.updated_at ?? latest.created_at ?? undefined,
      url: latest.html_url ?? `${repoUrl}/actions`,
    };
  } catch (e) {
    const code = statusCode(e);
    if (code === 404) {
      return {
        available: true,
        status: "none",
        passRate: null,
        totalRuns: 0,
        reason: "GitHub Actions is not enabled for this repo.",
        url: `${repoUrl}/actions`,
      };
    }
    errors.push(`CI: ${errorMessage(e)}`);
    return {
      available: false,
      status: "unknown",
      passRate: null,
      totalRuns: 0,
      reason: errorMessage(e),
    };
  }
}

async function fetchFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  path: string,
): Promise<RawFile> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
      return { available: false, path, reason: "Not a file." };
    }
    const content = Buffer.from(data.content, "base64").toString("utf8");
    return { available: true, path, content };
  } catch (e) {
    const code = statusCode(e);
    if (code === 404) return { available: false, path, reason: "Not found." };
    return { available: false, path, reason: errorMessage(e) };
  }
}

/** Try several candidate paths; return the first that exists. */
async function fetchFirstFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  paths: string[],
): Promise<RawFile> {
  let last: RawFile = { available: false, reason: "Not found." };
  for (const path of paths) {
    const f = await fetchFile(octokit, owner, repo, ref, path);
    if (f.available) return f;
    last = f;
  }
  return last;
}

// ────────────────────────────────────────────────────────────────────────────
// Status computation
// ────────────────────────────────────────────────────────────────────────────

function computeStatus(args: {
  readyForSubmission: boolean;
  ciFailing: boolean;
  stuckPRs: number;
  attentionCount: number;
  active24h: boolean;
}): ProjectStatus {
  if (args.readyForSubmission) return "ready";
  if (args.ciFailing || args.stuckPRs > 0 || args.attentionCount > 0) return "blocked";
  if (args.active24h) return "building";
  return "idle";
}

// ────────────────────────────────────────────────────────────────────────────
// Snapshot builder
// ────────────────────────────────────────────────────────────────────────────

function degraded(
  project: ProjectConfig,
  workingBranch: string,
  errors: string[],
  fetchedAt: string,
  repoMeta: RepoMeta,
): ProjectSnapshot {
  const repoUrl = `https://github.com/${project.owner}/${project.repo}`;
  return {
    slug: project.slug,
    displayName: project.displayName,
    owner: project.owner,
    repo: project.repo,
    kind: project.kind,
    workingBranch,
    repoUrl,
    branchUrl: `${repoUrl}/tree/${workingBranch}`,
    repoMeta,
    status: "idle",
    readyForSubmission: false,
    ready: { ready: false, checklist: [] },
    progress: {
      available: false,
      reason: "Data unavailable.",
      percentToSubmission: null,
      overallPct: null,
      tracks: [],
      subtracks: [],
      gateDone: 0,
      gateTotal: 0,
      method: "none",
    },
    mergedToday: 0,
    merged24h: 0,
    merged7d: 0,
    merged7dItems: [],
    recentMerged: [],
    openPRs: [],
    stuckPRs: 0,
    commitsToday: null,
    ci: { available: false, status: "unknown", passRate: null, totalRuns: 0 },
    actionItems: { available: false, items: [], note: "Data unavailable." },
    attentionIssues: [],
    files: {
      roadmap: { available: false },
      pendingOps: { available: false },
      improvementLog: { available: false },
      loopMemory: { available: false },
    },
    lastActivityAt: repoMeta.pushedAt ?? null,
    fetchedAt,
    errors,
    partial: true,
  };
}

async function buildSnapshot(project: ProjectConfig): Promise<ProjectSnapshot> {
  const fetchedAt = new Date().toISOString();
  const errors: string[] = [];
  const repoUrl = `https://github.com/${project.owner}/${project.repo}`;
  const octokit = getOctokit();

  if (!octokit) {
    return degraded(
      project,
      project.branch ?? "main",
      ["GITHUB_TOKEN is not set — add it to enable live data."],
      fetchedAt,
      { available: false, reason: "GITHUB_TOKEN is not set." },
    );
  }

  // 1) Repo meta (also resolves the working branch when not pinned).
  let repoMeta: RepoMeta = { available: false };
  let workingBranch = project.branch ?? "";
  try {
    const { data } = await octokit.rest.repos.get({
      owner: project.owner,
      repo: project.repo,
    });
    repoMeta = {
      available: true,
      defaultBranch: data.default_branch,
      visibility: data.visibility ?? (data.private ? "private" : "public"),
      pushedAt: data.pushed_at ?? undefined,
      htmlUrl: data.html_url,
      isPrivate: data.private,
    };
    if (!workingBranch) workingBranch = data.default_branch;
  } catch (e) {
    errors.push(`repo meta: ${errorMessage(e)}`);
    repoMeta = { available: false, reason: errorMessage(e) };
  }
  if (!workingBranch) workingBranch = "main";

  // If the repo itself is unreachable, bail to a degraded snapshot.
  if (!repoMeta.available && statusCodeFromErrors(errors)) {
    return degraded(project, workingBranch, errors, fetchedAt, repoMeta);
  }

  const { owner, repo } = project;

  // 2) Everything else in parallel.
  const [pulls, commits, issues, ci, roadmapFile, pendingFile, improvementFile, loopMemoryFile] =
    await Promise.all([
      fetchPulls(octokit, owner, repo, errors),
      fetchCommits(octokit, owner, repo, workingBranch, errors),
      fetchIssues(octokit, owner, repo, errors),
      fetchCI(octokit, owner, repo, workingBranch, repoUrl, errors),
      fetchFile(octokit, owner, repo, workingBranch, "ROADMAP.md"),
      fetchFile(octokit, owner, repo, workingBranch, "PENDING_OPS.md"),
      fetchFile(octokit, owner, repo, workingBranch, "IMPROVEMENT_LOG.md"),
      fetchFirstFile(octokit, owner, repo, workingBranch, [
        "docs/loop-memory.md",
        "docs/autonomous-loop/LOOP_MEMORY.md",
      ]),
    ]);

  // 3) Parse markdown. Progress is sub-track *coverage*: a sub-track counts as
  //    done if the roadmap annotates it done OR a merged PR references its code.
  const progressBase = parseRoadmap(roadmapFile.content);
  const definedCodes = new Set(progressBase.subtracks.map((s) => s.code));
  const doneCodes = new Set<string>();
  for (const c of [
    ...extractDoneAnnotations(roadmapFile.content),
    ...(pulls?.mergedCodes ?? []),
  ]) {
    if (definedCodes.has(c)) doneCodes.add(c);
  }

  const readyForSubmission = Boolean(issues?.readyIssue);

  // The factory's explicit "FACTORY: ready for submission" issue is
  // authoritative: when it's open the agent has met its Definition of Done, so
  // show 100% rather than the (necessarily lower) coverage estimate.
  let progress = finalizeProgress(progressBase, doneCodes);
  if (readyForSubmission && progress.available) {
    progress = {
      ...progress,
      percentToSubmission: 100,
      subtracks: progress.subtracks.map((s) => ({ ...s, done: true })),
      tracks: progress.tracks.map((t) => ({ ...t, done: t.total, pct: 100 })),
    };
  }

  const actionItems = parsePendingOps(
    pendingFile.available ? pendingFile.content : null,
  );

  const ready = {
    ready: readyForSubmission,
    url: issues?.readyIssue?.url,
    checklist: readyForSubmission
      ? parseReadyChecklist(issues?.readyIssue?.body, roadmapFile.content)
      : [],
  };

  // 4) Derived activity + status.
  const lastActivityAt = maxIso(
    repoMeta.pushedAt,
    pulls?.latestMergedAt,
    pulls?.latestOpenUpdatedAt,
    commits?.latest,
    ci.lastRunAt,
  );

  const active24h =
    (pulls?.merged24h ?? 0) > 0 ||
    (commits?.count ?? 0) > 0 ||
    withinHours(lastActivityAt, 24);

  const status = computeStatus({
    readyForSubmission,
    ciFailing: ci.status === "failing",
    stuckPRs: pulls?.stuckPRs ?? 0,
    attentionCount: issues?.attentionIssues.length ?? 0,
    active24h,
  });

  const partial =
    !repoMeta.available ||
    !pulls ||
    !commits ||
    !issues ||
    !ci.available ||
    !progress.available ||
    errors.length > 0;

  return {
    slug: project.slug,
    displayName: project.displayName,
    owner,
    repo,
    kind: project.kind,
    workingBranch,
    repoUrl,
    branchUrl: `${repoUrl}/tree/${workingBranch}`,
    repoMeta,
    status,
    readyForSubmission,
    ready,
    progress,
    mergedToday: pulls?.mergedToday ?? 0,
    merged24h: pulls?.merged24h ?? 0,
    merged7d: pulls?.merged7d ?? 0,
    merged7dItems: pulls?.merged7dItems ?? [],
    recentMerged: pulls?.recentMerged ?? [],
    openPRs: pulls?.openPRs ?? [],
    stuckPRs: pulls?.stuckPRs ?? 0,
    commitsToday: commits ? commits.count : null,
    ci,
    actionItems,
    attentionIssues: issues?.attentionIssues ?? [],
    files: {
      roadmap: roadmapFile,
      pendingOps: pendingFile,
      improvementLog: improvementFile,
      loopMemory: loopMemoryFile,
    },
    lastActivityAt,
    fetchedAt,
    errors,
    partial,
  };
}

/** Heuristic: did the repo-meta error look like a hard failure (auth/404)? */
function statusCodeFromErrors(errors: string[]): boolean {
  return errors.some((e) => /HTTP (401|403|404)/.test(e));
}

// ────────────────────────────────────────────────────────────────────────────
// Public, cached API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Cached per-project snapshot (ISR, ~600s). The cache key includes the slug so
 * each project caches independently; `fetchedAt` reflects when the cache entry
 * was built, which is what the UI shows as "last updated".
 */
export function getProjectSnapshot(project: ProjectConfig): Promise<ProjectSnapshot> {
  return unstable_cache(
    () => buildSnapshot(project),
    ["afd-snapshot", project.slug],
    { revalidate: SNAPSHOT_REVALIDATE_SECONDS, tags: [`project:${project.slug}`] },
  )();
}

/** All configured projects, fetched concurrently. Never rejects. */
export async function getAllSnapshots(): Promise<ProjectSnapshot[]> {
  return Promise.all(
    PROJECTS.map(async (p) => {
      try {
        return await getProjectSnapshot(p);
      } catch (e) {
        return degraded(
          p,
          p.branch ?? "main",
          [`snapshot failed: ${errorMessage(e)}`],
          new Date().toISOString(),
          { available: false, reason: errorMessage(e) },
        );
      }
    }),
  );
}
