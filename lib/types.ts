import type { ProjectKind } from "@/config/projects";

/** Computed project state. */
export type ProjectStatus = "ready" | "blocked" | "building" | "idle";

/** Current CI state for the working branch. */
export type CIStatus = "passing" | "failing" | "pending" | "unknown" | "none";

/**
 * Every fetched/parsed field carries an `available` flag so the UI can render
 * a clear "unavailable" state instead of crashing when a call fails or a file
 * is missing.
 */
export interface Availability {
  available: boolean;
  /** Human-readable reason when `available` is false. */
  reason?: string;
}

export interface PRItem {
  number: number;
  title: string;
  url: string;
  author?: string;
  /** ISO timestamp; present for merged PRs. */
  mergedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Age in hours for open PRs. */
  ageHours?: number;
  /** Open PR older than the stuck threshold (12h). */
  stuck?: boolean;
  draft?: boolean;
  /** ROADMAP track parsed from the title/body, if any. */
  track?: string | null;
}

export interface TrackProgress {
  label: string;
  done: number;
  total: number;
  /** 0–100. */
  pct: number;
}

export type ActionSource = "pending_ops" | "issue" | "human_core";

export interface ActionItem {
  id: string;
  text: string;
  /** Optional "how to" detail surfaced beneath the item. */
  howTo?: string;
  source: ActionSource;
  /** True when this is raw fallback text rather than a cleanly parsed item. */
  raw?: boolean;
}

export type AttentionKind = "harness_proposal" | "fyi" | "blocker" | "other";

export interface AttentionIssue {
  number: number;
  title: string;
  url: string;
  kind: AttentionKind;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Completeness and readiness are TWO separate axes — never collapse them into
 * one number (worth/ARR is a third axis, lives elsewhere).
 */
export interface ProgressInfo extends Availability {
  // ── Axis 1: submission readiness (the real stop gate) ──────────────────────
  /**
   * Headline "% to submission-ready" — checked/total checkboxes found ONLY in
   * the "Definition of Done" section. null when that section is absent/empty.
   */
  percentToSubmission: number | null;
  submissionDone: number;
  submissionTotal: number;
  submissionAvailable: boolean;

  // ── Axis 2: build completeness (granular progress) ─────────────────────────
  /** Checked/total across the Track sections (+ a P0 section). null when none. */
  buildPct: number | null;
  buildDone: number;
  buildTotal: number;
  buildAvailable: boolean;

  /** Per-track bars from the Track/P0 sections. */
  tracks: TrackProgress[];
  /** First unchecked checkbox item — the next concrete thing to do. */
  nextItem: string | null;
}

export interface CIInfo extends Availability {
  status: CIStatus;
  /** Pass rate over recent runs, 0–100. */
  passRate: number | null;
  totalRuns: number;
  lastRunAt?: string;
  url?: string;
}

export interface ActionItemsInfo extends Availability {
  items: ActionItem[];
  /** e.g. "none queued", "PENDING_OPS.md not found". */
  note?: string;
  /** Raw "Pending" section text surfaced when parsing is ambiguous. */
  rawSection?: string;
}

export interface ReadyInfo {
  ready: boolean;
  url?: string;
  /** Human-Core submission checklist, when ready. */
  checklist: ActionItem[];
}

/**
 * Evidence pulled from the "ready for submission" issue body — the repos now
 * gate that issue behind a mechanical pre-flight + ≥3 adversarial auditors and
 * paste the proof into the body. "Ready" must show its proof.
 */
export interface ReadyEvidence {
  /** True/false when a pre-flight result is stated; null when not found. */
  preflightPassed: boolean | null;
  /** Short pre-flight summary, e.g. "37 PASS / 2 WARN / 0 FAIL". */
  preflightSummary?: string;
  /** How many adversarial auditors signed off, if the body says. */
  auditorCount: number | null;
  /** Short bullets summarizing what the auditors verified. */
  auditorFindings: string[];
}

/**
 * The readiness gates that stand between a project and "ready". Shown when NOT
 * ready so the WHY is visible. Brand-new in the repos — fields say "not yet
 * built / not yet run" rather than fabricating a state we can't observe.
 */
export interface ReadinessGates {
  /** Definition-of-Done checkboxes. */
  dodDone: number;
  dodTotal: number;
  dodAvailable: boolean;
  dodComplete: boolean;
  /** scripts/preflight.sh — observed present/absent (the mechanical gate 1). */
  preflightPresent: boolean;
  /** Whether the file fetch was actually attempted (so we don't fake "absent"). */
  preflightChecked: boolean;
  /**
   * Whether the adversarial readiness audit (gate 2) has run. Only observable
   * once the ready issue opens, so: "passed" when ready, else "not_yet_run".
   */
  auditState: "passed" | "not_yet_run";
}

export type LivenessLevel = "fresh" | "slow" | "stalled" | "unknown";

/** How recently the loop shipped, vs its ~6h cadence — "is it still running?". */
export interface Liveness {
  level: LivenessLevel;
  /** Hours since the last merged PR / commit. null when never/unknown. */
  hoursSinceShip: number | null;
  /** ISO of the most recent ship (merge or commit). */
  lastShipAt: string | null;
  /** Loud flag: the loop may be stalled (>18h since a ship, or quiet 24h). */
  stalled: boolean;
}

/** The latest self-audit recorded in docs/loop-memory.md (the loop auditing itself). */
export interface LoopMemoryHealth extends Availability {
  hasAudit: boolean;
  /** ISO date (YYYY-MM-DD) of the most recent DEEP AUDIT mention. */
  lastAuditDate?: string;
  /** One-line note next to that audit. */
  note?: string;
}

export interface RawFile extends Availability {
  path?: string;
  content?: string;
  /** ISO date of the file's last commit (when fetched with history). */
  lastCommitDate?: string;
  /** SHA of the file's last commit (used to bust caches when it changes). */
  lastCommitSha?: string;
}

export interface RepoMeta extends Availability {
  defaultBranch?: string;
  visibility?: string;
  pushedAt?: string;
  htmlUrl?: string;
  isPrivate?: boolean;
}

/** The single typed object the whole UI renders from. */
export interface ProjectSnapshot {
  // identity
  slug: string;
  displayName: string;
  owner: string;
  repo: string;
  kind: ProjectKind;
  /** Resolved working branch (config.branch or repo default_branch). */
  workingBranch: string;
  repoUrl: string;
  branchUrl: string;

  // repo meta
  repoMeta: RepoMeta;

  // computed status
  status: ProjectStatus;
  readyForSubmission: boolean;
  ready: ReadyInfo;
  /** Proof from the ready issue body (pre-flight + auditors); null until ready. */
  readyEvidence: ReadyEvidence | null;
  /** The gates between here and "ready" — shown when NOT ready. */
  readinessGates: ReadinessGates;

  // progress
  progress: ProgressInfo;

  // loop health
  /** "Is it still running?" — recency of the last ship vs the ~6h cadence. */
  liveness: Liveness;
  /** Latest DEEP AUDIT recorded in loop-memory. */
  loopMemoryHealth: LoopMemoryHealth;

  // PR activity
  mergedToday: number;
  merged24h: number;
  merged7d: number;
  /** All PRs merged within the last 7 days (newest first). */
  merged7dItems: PRItem[];
  /** Last 10 merged PRs (newest first). */
  recentMerged: PRItem[];
  openPRs: PRItem[];
  stuckPRs: number;

  // commits on working branch in the last ~25h
  commitsToday: number | null;

  // CI
  ci: CIInfo;

  // action items + attention
  actionItems: ActionItemsInfo;
  attentionIssues: AttentionIssue[];

  // raw factory files
  files: {
    roadmap: RawFile;
    pendingOps: RawFile;
    improvementLog: RawFile;
    loopMemory: RawFile;
    /** docs/BUSINESS_CASE.md — the project's bottoms-up revenue model. */
    businessCase: RawFile;
    /** scripts/preflight.sh — the mechanical readiness gate (present/absent). */
    preflight: RawFile;
  };

  // freshness
  lastActivityAt: string | null;
  /** ISO timestamp when this snapshot was computed. */
  fetchedAt: string;
  /** Non-fatal errors collected while building the snapshot. */
  errors: string[];
  /** True when any field degraded to an unavailable/partial state. */
  partial: boolean;
}

/** A single merged-PR entry in the cross-project activity feed. */
export interface FeedEntry extends PRItem {
  projectSlug: string;
  projectName: string;
  ci: CIStatus;
}
