import { unstable_cache } from "next/cache";
import type { ProjectSnapshot } from "@/lib/types";
import { needsFor } from "@/lib/aggregate";
import { headlinePct, nextMilestone, pluralize } from "@/lib/utils";

export interface Narrative {
  text: string;
  source: "llm" | "template";
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

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

  const needs = needsFor(s).length;
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

/** Compact factual context handed to the LLM. */
function llmContext(s: ProjectSnapshot): string {
  const pct = headlinePct(s);
  const lines = [
    `Project: ${s.displayName} (${s.kind})`,
    `Working branch: ${s.workingBranch}`,
    `Status: ${s.status}`,
    pct !== null ? `Progress to submission: ${pct}%` : `Progress: unknown`,
    `Merged PRs — today: ${s.mergedToday}, last 24h: ${s.merged24h}, last 7d: ${s.merged7d}`,
    `Commits in last ~25h: ${s.commitsToday ?? "unknown"}`,
    `Open PRs: ${s.openPRs.length} (${s.stuckPRs} stuck > 12h)`,
    `CI: ${s.ci.status}${s.ci.passRate !== null ? ` (${s.ci.passRate}% pass)` : ""}`,
    `Action items waiting on human: ${s.actionItems.items.length}`,
    `Attention issues: ${s.attentionIssues.length}`,
    s.readyForSubmission ? `READY FOR SUBMISSION` : "",
    s.progress.tracks.length
      ? `Tracks: ${s.progress.tracks.map((t) => `${t.label} ${t.pct}%`).join(", ")}`
      : "",
    s.recentMerged.length
      ? `Recently shipped: ${s.recentMerged.slice(0, 5).map((p) => p.title).join("; ")}`
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}

async function llmNarrative(s: ProjectSnapshot): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    // Imported lazily so the SDK never loads unless a key is configured.
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 200,
        system:
          "You write a 2-3 sentence status digest for an autonomous software " +
          "project being shipped by a scheduled coding agent. Be factual, " +
          "specific, and warm but concise. Plain prose only — no markdown, no " +
          "lists, no preamble. Lead with momentum, then what's notable, then " +
          "what (if anything) needs the human.",
        messages: [
          {
            role: "user",
            content: `Write the digest from these metrics:\n\n${llmContext(s)}`,
          },
        ],
      },
      { timeout: 12_000 },
    );

    const text = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join(" ")
      .trim();

    return text || null;
  } catch {
    // Any failure (no network, bad key, timeout) → fall back to the template.
    return null;
  }
}

/**
 * Per-project narrative. Uses the Anthropic SDK when ANTHROPIC_API_KEY is set,
 * otherwise a templated summary. Never throws; never blocks the page beyond a
 * short timeout. Cached ~10 min, keyed on the metrics that would change it.
 */
export function getNarrative(s: ProjectSnapshot): Promise<Narrative> {
  const cacheKey = [
    "afd-narrative",
    s.slug,
    String(headlinePct(s)),
    String(s.merged24h),
    s.status,
    s.ci.status,
    String(s.actionItems.items.length),
    String(s.readyForSubmission),
  ];

  return unstable_cache(
    async (): Promise<Narrative> => {
      const llm = await llmNarrative(s);
      if (llm) return { text: llm, source: "llm" };
      return { text: templateNarrative(s), source: "template" };
    },
    cacheKey,
    { revalidate: 600 },
  )();
}
