import { unstable_cache } from "next/cache";
import type { ProjectSnapshot } from "@/lib/types";
import { humanAsksFor } from "@/lib/aggregate";
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

/** Deterministic, always-available summary built from the snapshot. */
export function templateNarrative(s: ProjectSnapshot): string {
  const parts: string[] = [];
  const pct = headlinePct(s);

  if (s.merged24h > 0) {
    parts.push(
      `${s.displayName} merged ${s.merged24h} ${pluralize(s.merged24h, "PR")} in the last 24 hours` +
        (pct !== null ? `, now at ${pct}% toward submission.` : "."),
    );
  } else if (pct !== null) {
    parts.push(
      `${s.displayName} sits at ${pct}% toward submission with no merges in the last 24 hours.`,
    );
  } else {
    parts.push(`${s.displayName} has had no merge activity in the last day.`);
  }

  const milestone = nextMilestone(s);
  if (s.ci.status === "failing") {
    parts.push(`CI is currently failing on ${s.workingBranch}.`);
  } else if (s.ci.status === "passing") {
    parts.push(
      milestone ? `CI is green; ${milestone} is the next milestone.` : "CI is green.",
    );
  } else if (milestone) {
    parts.push(`${milestone} is the next milestone.`);
  }

  const needs = humanAsksFor(s).length;
  if (s.readyForSubmission) {
    parts.push("It's ready for submission — your sign-off is the last step.");
  } else if (needs > 0) {
    parts.push(
      `${needs} ${pluralize(needs, "item")} ${needs === 1 ? "is" : "are"} waiting on you.`,
    );
  } else {
    parts.push("Nothing is waiting on you right now.");
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

async function llmNarrative(
  s: ProjectSnapshot,
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
        // Optional attribution for the OpenRouter dashboard/leaderboard.
        "X-Title": "AutoFactoryDashboard",
      },
      body: JSON.stringify({
        model,
        max_tokens: 220,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Write the digest from these metrics:\n\n${llmContext(s)}`,
          },
        ],
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
