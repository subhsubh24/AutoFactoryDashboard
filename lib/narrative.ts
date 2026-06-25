import { unstable_cache } from "next/cache";
import type { ProjectSnapshot } from "@/lib/types";
import { humanAsksFor } from "@/lib/aggregate";
import { extractThemes, themeSummary } from "@/lib/themes";
import { parseBusinessCase, type Valuation } from "@/lib/businesscase";
import { headlinePct, kindLabel, nextMilestone, pluralize } from "@/lib/utils";

export type { Valuation };

export interface Narrative {
  /** Punchy 3–7 word headline — the glanceable "what's the story". */
  headline: string;
  text: string;
  source: "llm" | "template";
  /** Model used when source === "llm". */
  model?: string;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Bump to invalidate cached narratives/briefings after a logic/format change
// (unstable_cache entries can otherwise survive across deploys).
const CACHE_VERSION = "v3";

// Google Gemini free tier — reliable, generous quota. Preferred when set.
const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash";
// OpenRouter free model (slugs rotate / get rate-limited; used as a fallback).
const OPENROUTER_DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

/** The model label for the active provider — also used in cache keys. */
function currentModel(): string {
  if (process.env.GEMINI_API_KEY)
    return process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
  if (process.env.OPENROUTER_API_KEY)
    return process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL;
  return "template";
}

const SYSTEM_PROMPT =
  "You write a status update for an autonomous software project that a " +
  "scheduled coding agent ships to. Respond in EXACTLY this format, nothing " +
  "else:\n" +
  "HEADLINE: <a punchy 3-7 word headline, no trailing period>\n" +
  "DIGEST: <2 sentences — what shipped in the last 24h and where it stands; " +
  "then what's coming next>\n" +
  "Be specific and grounded only in the data given; do not invent features. " +
  "Warm but concise. Plain prose, no markdown or lists. If nothing shipped in " +
  "24h, say so plainly and focus on current state and next.";

/** Split the model's "HEADLINE: …\nDIGEST: …" reply; tolerant of stray text. */
function parseHeadlineDigest(raw: string): { headline?: string; text: string } {
  const hl = raw.match(/HEADLINE:\s*(.+)/i);
  const dg = raw.match(/DIGEST:\s*([\s\S]+)/i);
  const headline = hl?.[1]
    ?.trim()
    .replace(/^["'"]|["'"]$/g, "")
    .replace(/[.\s]+$/, "");
  if (dg) return { headline, text: dg[1].trim() };
  // No DIGEST label — drop any stray HEADLINE line, keep the rest as the digest.
  const text = raw.replace(/^\s*HEADLINE:.*$/im, "").trim();
  return { headline, text: text || headline || raw.trim() };
}

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
      ? `It's ${pct}% to submission-ready`
      : s.progress.buildPct !== null
        ? `Build is ${s.progress.buildPct}% complete`
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

/** Deterministic headline fallback (and what we show without an LLM key). */
export function templateHeadline(s: ProjectSnapshot): string {
  if (s.readyForSubmission) return "Ready to ship";
  if (s.ci.status === "failing") return "CI red — needs a look";
  const top = extractThemes(s.merged7dItems)[0]?.label;
  if (s.merged24h > 0 && top) {
    const t = top.replace(/ work$/, "").replace(/ & evals$/, "");
    return `Shipping ${t}`;
  }
  if (s.merged24h > 0) return `${s.merged24h} ${pluralize(s.merged24h, "PR")} overnight`;
  const pct = headlinePct(s);
  if (pct !== null) return `~${pct}% to launch`;
  return "Quiet right now";
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
    pct !== null
      ? `Submission readiness (Definition of Done): ${pct}%`
      : `Submission readiness: not measured`,
    s.progress.buildPct !== null
      ? `Build completeness (track checkboxes): ${s.progress.buildPct}%`
      : "",
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

  const model = process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL;
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

/** Single Google Gemini call (Generative Language REST API). */
async function callGemini(
  messages: ChatMessage[],
  maxTokens: number,
): Promise<{ text: string; model: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
  const system = messages.find((m) => m.role === "system")?.content;
  const user = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n\n");
  try {
    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    return text ? { text, model } : null;
  } catch {
    return null;
  }
}

/**
 * Provider-agnostic LLM call. Prefers Gemini (reliable free tier) when
 * GEMINI_API_KEY is set, falls back to OpenRouter, then to null (→ template).
 */
async function callLLM(
  messages: ChatMessage[],
  maxTokens: number,
): Promise<{ text: string; model: string } | null> {
  return (
    (await callGemini(messages, maxTokens)) ??
    (await callOpenRouter(messages, maxTokens))
  );
}

async function llmNarrative(
  s: ProjectSnapshot,
): Promise<{ headline?: string; text: string; model: string } | null> {
  const res = await callLLM(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Write the update from these metrics:\n\n${llmContext(s)}` },
    ],
    240,
  );
  if (!res) return null;
  const { headline, text } = parseHeadlineDigest(res.text);
  return { headline, text, model: res.model };
}

/**
 * Per-project narrative. Uses OpenRouter when OPENROUTER_API_KEY is set,
 * otherwise a templated summary. Never throws; never blocks the page beyond a
 * short timeout. Cached ~10 min, keyed on the metrics that would change it.
 */
export function getNarrative(s: ProjectSnapshot): Promise<Narrative> {
  const cacheKey = [
    "afd-narrative",
    CACHE_VERSION,
    s.slug,
    currentModel(),
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
      if (llm) {
        return {
          headline: llm.headline || templateHeadline(s),
          text: llm.text,
          source: "llm",
          model: llm.model,
        };
      }
      return {
        headline: templateHeadline(s),
        text: templateNarrative(s),
        source: "template",
      };
    },
    cacheKey,
    { revalidate: 600 },
  )();
}

// ────────────────────────────────────────────────────────────────────────────
// Factory-wide briefing (the one-glance "good morning, here's the state")
// ────────────────────────────────────────────────────────────────────────────

const FACTORY_SYSTEM =
  "You write a 2-sentence status briefing for someone running several " +
  "autonomous software projects shipped by scheduled coding agents. Sentence " +
  "one: overall momentum across all projects in the last 24 hours (lead with " +
  "what shipped and what it focused on). Sentence two: the one or two things " +
  "most worth their attention (a blocker, red CI, something ready to ship) — or " +
  "that nothing needs them. Specific, warm, concise. Plain prose only: no " +
  "markdown, no lists, no preamble.";

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
    CACHE_VERSION,
    currentModel(),
    String(totalMerged),
    String(needs),
    ...snapshots.map(
      (s) =>
        `${s.slug}:${headlinePct(s)}:${s.status}:${s.ci.status}:${s.recentMerged[0]?.number ?? ""}`,
    ),
  ];

  return unstable_cache(
    async (): Promise<FactoryBriefing> => {
      const llm = await callLLM(
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

// ────────────────────────────────────────────────────────────────────────────
// Launch summary — "what the factory built" (shown when ready for submission)
// ────────────────────────────────────────────────────────────────────────────

export interface LaunchSummary {
  /** 2–3 sentence overview of what the product is and who it's for. */
  overview: string;
  /** Concrete shipped features. */
  features: string[];
  source: "llm" | "template";
}

const LAUNCH_SYSTEM =
  "An autonomous coding agent has finished building a product and flagged it " +
  "ready to submit. Write a launch summary for the owner from the roadmap and " +
  "shipped work. Respond in EXACTLY this format, nothing else:\n" +
  "OVERVIEW: <2-3 sentences: what the product is, who it's for, what it does>\n" +
  "FEATURES:\n- <shipped feature>\n- <shipped feature>\n" +
  "(6-12 concrete feature bullets). Ground everything in the data provided; do " +
  "not invent. Plain text, no markdown bold.";

function launchContext(s: ProjectSnapshot): string {
  const roadmap =
    s.files.roadmap.available && s.files.roadmap.content
      ? clip(s.files.roadmap.content, 3500)
      : "";
  const titles = s.merged7dItems
    .slice(0, 40)
    .map((p) => `- ${p.title}`)
    .join("\n");
  const tracks = s.progress.tracks
    .map((t) => `${t.label}: ${t.done}/${t.total}`)
    .join(", ");
  return [
    `Product: ${s.displayName} (${kindLabel(s.kind)})`,
    tracks ? `Tracks: ${tracks}` : "",
    titles ? `Recently shipped PRs:\n${titles}` : "",
    roadmap ? `ROADMAP.md:\n${roadmap}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function parseLaunch(raw: string): { overview: string; features: string[] } {
  const ovMatch = raw.match(/OVERVIEW:\s*([\s\S]*?)(?:\n\s*FEATURES:|$)/i);
  const featMatch = raw.match(/FEATURES:\s*([\s\S]+)/i);
  const overview = (ovMatch?.[1] ?? "").trim();
  const features = (featMatch?.[1] ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").replace(/[*`]/g, "").trim())
    .filter((l) => l.length > 2)
    .slice(0, 14);
  return { overview: overview || raw.trim(), features };
}

function templateLaunch(s: ProjectSnapshot): LaunchSummary {
  const trackLabels = s.progress.tracks.map((t) => t.label).filter((l) => l.length > 2);
  const themeLabels = extractThemes(s.merged7dItems).map((t) => t.label);
  const features = (themeLabels.length ? themeLabels : trackLabels).slice(0, 12);
  return {
    overview: `${s.displayName} is a ${kindLabel(s.kind)} product built end-to-end by the factory and flagged ready for submission.`,
    features,
    source: "template",
  };
}

/**
 * "What the factory built" — an overview + feature list for a completed project.
 * Only meaningful when the project is ready for submission. LLM with a
 * deterministic fallback; cached ~10 min.
 */
export function getLaunchSummary(s: ProjectSnapshot): Promise<LaunchSummary> {
  const cacheKey = [
    "afd-launch",
    CACHE_VERSION,
    s.slug,
    currentModel(),
    String(s.recentMerged[0]?.number ?? ""),
  ];

  return unstable_cache(
    async (): Promise<LaunchSummary> => {
      const llm = await callLLM(
        [
          { role: "system", content: LAUNCH_SYSTEM },
          { role: "user", content: launchContext(s) },
        ],
        700,
      );
      if (llm) {
        const { overview, features } = parseLaunch(llm.text);
        if (features.length > 0) return { overview, features, source: "llm" };
      }
      return templateLaunch(s);
    },
    cacheKey,
    { revalidate: 600 },
  )();
}

// ────────────────────────────────────────────────────────────────────────────
// Valuation — primary: docs/BUSINESS_CASE.md; fallback: rough heuristic
// ────────────────────────────────────────────────────────────────────────────

const VALUATION_SYSTEM =
  "You are a pragmatic indie-SaaS analyst. Given a product built by an " +
  "autonomous agent, estimate its plausible ANNUAL recurring revenue (ARR) in " +
  "its first 12 months if launched now, in US dollars. Be realistic and " +
  "conservative — most indie apps earn little; weight by how complete and " +
  "monetizable it is. Use the pricing if given. Respond EXACTLY:\n" +
  "ARR_LOW: <number>\nARR_EXPECTED: <number>\nARR_HIGH: <number>\n" +
  "RATIONALE: <1 sentence: the key driver/assumption>\n" +
  "Plain integers only (e.g. 12000), no $ or commas.";

function priceHints(s: ProjectSnapshot): string {
  const text = [s.files.roadmap.content, s.files.pendingOps.content]
    .filter(Boolean)
    .join("\n");
  const prices = [
    ...text.matchAll(/\$\s?\d+(?:\.\d+)?\s*\/\s*(?:mo|month|yr|year|annual)/gi),
  ]
    .map((m) => m[0].replace(/\s+/g, ""))
    .slice(0, 4);
  return [...new Set(prices)].join(", ");
}

function valuationContext(s: ProjectSnapshot): string {
  const pct = headlinePct(s);
  const themes = extractThemes(s.merged7dItems)
    .slice(0, 5)
    .map((t) => t.label)
    .join(", ");
  const hints = priceHints(s);
  return [
    `Product: ${s.displayName} (${kindLabel(s.kind)})`,
    `Status: ${s.status}${s.readyForSubmission ? " — ready to submit" : ""}, ~${pct ?? "?"}% complete`,
    hints ? `Pricing: ${hints}` : "Pricing: unknown (assume freemium subscription)",
    themes ? `Focus areas: ${themes}` : "",
    s.files.roadmap.available && s.files.roadmap.content
      ? `Roadmap (excerpt):\n${clip(s.files.roadmap.content, 1500)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseValuationNum(raw: string, label: string): number | null {
  const m = raw.match(new RegExp(`${label}\\s*:?\\s*\\$?\\s*([\\d.,]+\\s*[kKmM]?)`, "i"));
  if (!m) return null;
  let str = m[1].replace(/[, ]/g, "");
  let mult = 1;
  if (/k$/i.test(str)) {
    mult = 1_000;
    str = str.replace(/k$/i, "");
  } else if (/m$/i.test(str)) {
    mult = 1_000_000;
    str = str.replace(/m$/i, "");
  }
  const n = parseFloat(str);
  return Number.isNaN(n) ? null : Math.round(n * mult);
}

function templateValuation(s: ProjectSnapshot): Valuation {
  const text = [s.files.roadmap.content, s.files.pendingOps.content]
    .filter(Boolean)
    .join("\n");
  const yr = [...text.matchAll(/\$\s?(\d+(?:\.\d+)?)\s*\/\s*(?:yr|year|annual)/gi)].map(
    (m) => parseFloat(m[1]),
  )[0];
  const mo = [...text.matchAll(/\$\s?(\d+(?:\.\d+)?)\s*\/\s*(?:mo|month)/gi)].map((m) =>
    parseFloat(m[1]),
  )[0];
  const annual = yr ?? (mo ? mo * 10 : 60); // ~$5/mo with churn ≈ $50–60/yr
  // Scale a little by completeness; conservative first-year paying users.
  const factor = s.readyForSubmission ? 1 : 0.5;
  return {
    arrLow: Math.round(annual * 25 * factor),
    arrExpected: Math.round(annual * 150 * factor),
    arrHigh: Math.round(annual * 800 * factor),
    rationale: `Rough estimate from ${yr ? `$${yr}/yr` : mo ? `$${mo}/mo` : "assumed ~$5/mo"} pricing and a small first-year user base.`,
    source: "template",
  };
}

/**
 * Estimated annual revenue for a project.
 *
 *  1. PRIMARY — the project's own bottoms-up model in docs/BUSINESS_CASE.md
 *     (source: "business_case"). No LLM call needed when present.
 *  2. FALLBACK — the rough heuristic: LLM estimate, then a pricing×adoption
 *     formula (source: "llm" / "template" — shown as "rough heuristic").
 */
export function getValuation(s: ProjectSnapshot): Promise<Valuation> {
  const bc = s.files.businessCase;
  const cacheKey = [
    "afd-valuation",
    CACHE_VERSION,
    s.slug,
    currentModel(),
    String(headlinePct(s)),
    String(s.readyForSubmission),
    // A new business case (new commit) busts the cache.
    bc?.lastCommitSha ?? bc?.lastCommitDate ?? "no-bc",
  ];
  return unstable_cache(
    async (): Promise<Valuation> => {
      // 1) Business case is authoritative — and free (no LLM). When the file
      //    exists we NEVER substitute the heuristic, even if parsing finds no
      //    ARR total (we'd rather show no number than a fabricated one).
      if (bc?.available && bc.content) {
        const sourceUrl = `${s.repoUrl}/blob/${s.workingBranch}/${bc.path ?? "docs/BUSINESS_CASE.md"}`;
        const parsed = parseBusinessCase(bc.content, sourceUrl, bc.lastCommitDate);
        if (parsed) return parsed;
        return {
          arrLow: 0,
          arrExpected: 0,
          arrHigh: 0,
          rationale: "Business case present, but no scenario ARR total could be parsed.",
          source: "business_case",
          sourceUrl,
          asOf: bc.lastCommitDate,
        };
      }

      // 2) Heuristic fallback — only when BUSINESS_CASE.md is genuinely absent.
      const llm = await callLLM(
        [
          { role: "system", content: VALUATION_SYSTEM },
          { role: "user", content: valuationContext(s) },
        ],
        200,
      );
      if (llm) {
        const exp = parseValuationNum(llm.text, "ARR_EXPECTED");
        if (exp !== null) {
          const low = parseValuationNum(llm.text, "ARR_LOW");
          const high = parseValuationNum(llm.text, "ARR_HIGH");
          const rationale =
            llm.text.match(/RATIONALE:\s*([\s\S]+)/i)?.[1]?.trim().split("\n")[0] ?? "";
          return {
            arrLow: low ?? Math.round(exp * 0.3),
            arrExpected: exp,
            arrHigh: high ?? Math.round(exp * 3),
            rationale,
            source: "llm",
          };
        }
      }
      return templateValuation(s);
    },
    cacheKey,
    { revalidate: 3600 },
  )();
}
