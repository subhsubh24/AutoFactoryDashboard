import { unstable_cache } from "next/cache";
import type { ProjectSnapshot } from "@/lib/types";
import { humanAsksFor } from "@/lib/aggregate";
import { extractThemes, themeSummary } from "@/lib/themes";
import { headlinePct, nextMilestone, pluralize } from "@/lib/utils";

export interface Narrative {
  text: string;
  source: "llm" | "template";
  /** Model used when source === "llm". */
  model?: string;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Free, fast instruct model. Override with OPENROUTER_MODEL (free slugs rotate;
// see https://openrouter.ai/models?max_price=0). An invalid/decommissioned slug
// simply falls back to the templated summary — it never breaks the page.
const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

const SYSTEM_PROMPT =
  "You write a tight 2-sentence status briefing for an autonomous software " +
  "project that a scheduled coding agent ships to. Sentence one: what shipped " +
  "in the last 24 hours and where the project stands now. Sentence two: what's " +
  "coming next — the next milestone or concrete next steps. Be specific and " +
  "grounded only in the data given; do not invent features. Warm but concise. " +
  "Plain prose only — no markdown, no lists, no preamble, no 'the project'. If " +
  "nothing shipped in 24h, say so plainly and focus on current state and next.";

function clip(text: string, n: number): string {
  const t = text.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/**
 * Deterministic, always-available summary built from the snapshot — describes
 * what shipped (themes), where it stands (%), and what's next (milestone), so
 * the tiles are informative even without an OpenRouter key.
 */
export function templateNarrative(s: ProjectSnapshot): string {
  const parts: string[] = [];
  const pct = headlinePct(s);
  const focus = themeSummary(extractThemes(s.merged7dItems));
  const focusClause = focus
    ? ` — ${focus.replace(/^Mostly /, "mostly ").replace(/\.$/, "")}`
    : "";

  if (s.merged24h > 0) {
    parts.push(
      `${s.displayName} shipped ${s.merged24h} ${pluralize(s.merged24h, "PR")} in the last 24h${focusClause}.`,
    );
  } else if (s.merged7d > 0) {
    parts.push(
      `${s.displayName} had no merges in the last 24h but shipped ${s.merged7d} this week${focusClause}.`,
    );
  } else {
    parts.push(`${s.displayName} has had no merge activity recently.`);
  }

  const where =
    pct !== null
      ? `It's about ${pct}% of the way through its roadmap`
      : "Roadmap progress is unmeasured";
  const milestone = nextMilestone(s);
  const ciClause =
    s.ci.status === "failing"
      ? ", but CI is failing"
      : s.ci.status === "passing"
        ? " with CI green"
        : "";

  if (s.readyForSubmission) {
    parts.push(`${where}${ciClause} — and it's ready for submission; your sign-off is the last step.`);
  } else if (milestone) {
    parts.push(`${where}${ciClause}; next up is ${milestone}.`);
  } else {
    parts.push(`${where}${ciClause}.`);
  }

  return parts.join(" ");
}

/** Compact factual context handed to the LLM — metrics + curated factory files. */
function llmContext(s: ProjectSnapshot): string {
  const pct = headlinePct(s);
  const milestone = nextMilestone(s);

  const shippedTitles = s.merged7dItems
    .filter((p) => {
      const t = Date.parse(p.mergedAt ?? "");
      return !Number.isNaN(t) && Date.now() - t <= 24 * 60 * 60 * 1000;
    })
    .slice(0, 8)
    .map((p) => `- ${p.title}`)
    .join("\n");
  const openTop = s.openPRs
    .slice(0, 5)
    .map((p) => `- #${p.number} ${p.title}${p.stuck ? " (stuck)" : ""}`)
    .join("\n");
  const queued = s.actionItems.items
    .slice(0, 6)
    .map((i) => `- ${i.text}`)
    .join("\n");

  const roadmap =
    s.files.roadmap.available && s.files.roadmap.content
      ? clip(s.files.roadmap.content, 1400)
      : "";
  const improvementLog =
    s.files.improvementLog.available && s.files.improvementLog.content
      ? clip(s.files.improvementLog.content, 600)
      : "";

  const lines = [
    `Project: ${s.displayName} (${s.kind})`,
    `Working branch: ${s.workingBranch}`,
    `Status: ${s.status}`,
    pct !== null ? `Progress to submission: ${pct}%` : `Progress: unknown`,
    `Merged PRs — today: ${s.mergedToday}, last 24h: ${s.merged24h}, last 7d: ${s.merged7d}`,
    `Commits in last ~25h: ${s.commitsToday ?? "unknown"}`,
    `Open PRs: ${s.openPRs.length} (${s.stuckPRs} stuck > 12h)`,
    `CI: ${s.ci.status}${s.ci.passRate !== null ? ` (${s.ci.passRate}% pass)` : ""}`,
    s.readyForSubmission ? `READY FOR SUBMISSION` : "",
    s.progress.tracks.length
      ? `Tracks: ${s.progress.tracks.map((t) => `${t.label} ${t.pct}%`).join(", ")}`
      : "",
    milestone ? `Next milestone (lowest-complete track): ${milestone}` : "",
    shippedTitles ? `Shipped in last 24h:\n${shippedTitles}` : "",
    openTop ? `Open PRs in flight:\n${openTop}` : "",
    queued ? `Queued ops / action items:\n${queued}` : "",
    roadmap ? `ROADMAP.md (excerpt):\n${roadmap}` : "",
    improvementLog ? `IMPROVEMENT_LOG.md (recent excerpt):\n${improvementLog}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

/** Single OpenRouter chat call. Returns null on any failure (caller falls back). */
async function callOpenRouter(
  messages: ChatMessage[],
  maxTokens: number,
): Promise<{ text: string; model: string } | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "AutoFactoryDashboard",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.4,
        messages,
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text ? { text, model } : null;
  } catch {
    // Any failure (no network, bad key, bad model, timeout) → templated.
    return null;
  }
}

function llmNarrative(
  s: ProjectSnapshot,
): Promise<{ text: string; model: string } | null> {
  return callOpenRouter(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Write the digest from these metrics:\n\n${llmContext(s)}` },
    ],
    220,
  );
}

/**
 * Per-project narrative. Uses OpenRouter when OPENROUTER_API_KEY is set,
 * otherwise a templated summary. Never throws; never blocks the page beyond a
 * short timeout. Cached ~10 min, keyed on the metrics that would change it.
 */
export function getNarrative(s: ProjectSnapshot): Promise<Narrative> {
  const cacheKey = [
    "afd-narrative",
    s.slug,
    process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    String(headlinePct(s)),
    String(s.merged24h),
    s.status,
    s.ci.status,
    String(s.actionItems.items.length),
    String(s.readyForSubmission),
    // Bust when something new ships, even if the counts above are unchanged.
    String(s.recentMerged[0]?.number ?? ""),
  ];

  return unstable_cache(
    async (): Promise<Narrative> => {
      const llm = await llmNarrative(s);
      if (llm) return { text: llm.text, source: "llm", model: llm.model };
      return { text: templateNarrative(s), source: "template" };
    },
    cacheKey,
    { revalidate: 600 },
  )();
}

// ────────────────────────────────────────────────────────────────────────────
// Factory-wide briefing (the one-glance "good morning, here's the state")
// ────────────────────────────────────────────────────────────────────────────

const FACTORY_SYSTEM =
  "You write a 2-sentence good-morning briefing for someone running several " +
  "autonomous software projects shipped by scheduled coding agents. Sentence " +
  "one: overall momentum across all projects (lead with what shipped and what " +
  "it focused on). Sentence two: the one or two things most worth their " +
  "attention (a blocker, red CI, something ready to ship) — or that nothing " +
  "needs them. Specific, warm, concise. Plain prose only: no markdown, no " +
  "lists, no preamble.";

function factoryContext(snapshots: ProjectSnapshot[]): string {
  return snapshots
    .map((s) => {
      const pct = headlinePct(s);
      const focus = themeSummary(extractThemes(s.merged7dItems));
      return (
        `- ${s.displayName}: ${s.status}, ${s.merged24h} merged in 24h, ` +
        `${pct ?? "?"}% through roadmap, CI ${s.ci.status}, ` +
        `${humanAsksFor(s).length} needing you` +
        (focus ? `; focus: ${focus}` : "")
      );
    })
    .join("\n");
}

export interface FactoryBriefing {
  text: string;
  source: "llm" | "template";
}

function templateBriefing(snapshots: ProjectSnapshot[]): string {
  const totalMerged = snapshots.reduce((n, s) => n + s.merged24h, 0);
  const needs = snapshots.reduce((n, s) => n + humanAsksFor(s).length, 0);
  const focus = themeSummary(extractThemes(snapshots.flatMap((s) => s.merged7dItems)));
  const lead =
    totalMerged > 0
      ? `${totalMerged} ${pluralize(totalMerged, "PR")} shipped across the factory in the last 24h` +
        (focus ? ` — ${focus.replace(/^Mostly /, "mostly ").replace(/\.$/, "")}` : "")
      : "Quiet across the factory — nothing shipped in the last 24h";
  const tail =
    needs > 0
      ? `${needs} ${pluralize(needs, "item")} ${needs === 1 ? "needs" : "need"} your attention.`
      : "Nothing needs you right now.";
  return `${lead}. ${tail}`;
}

/**
 * One short cross-project briefing for the top of the dashboard. Uses the LLM
 * when configured; always falls back to a deterministic summary.
 */
export function getFactoryBriefing(
  snapshots: ProjectSnapshot[],
): Promise<FactoryBriefing> {
  const totalMerged = snapshots.reduce((n, s) => n + s.merged24h, 0);
  const needs = snapshots.reduce((n, s) => n + humanAsksFor(s).length, 0);
  const cacheKey = [
    "afd-factory-briefing",
    process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    String(totalMerged),
    String(needs),
    ...snapshots.map(
      (s) =>
        `${s.slug}:${headlinePct(s)}:${s.status}:${s.ci.status}:${s.recentMerged[0]?.number ?? ""}`,
    ),
  ];

  return unstable_cache(
    async (): Promise<FactoryBriefing> => {
      const llm = await callOpenRouter(
        [
          { role: "system", content: FACTORY_SYSTEM },
          {
            role: "user",
            content:
              `Projects:\n${factoryContext(snapshots)}\n\n` +
              `Total merged in last 24h: ${totalMerged}. Items needing the human: ${needs}.`,
          },
        ],
        200,
      );
      if (llm) return { text: llm.text, source: "llm" };
      return { text: templateBriefing(snapshots), source: "template" };
    },
    cacheKey,
    { revalidate: 600 },
  )();
}
