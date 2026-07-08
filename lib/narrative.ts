import { unstable_cache } from "next/cache";
import type {
  ActionItem,
  ActionPlan,
  ActionPriority,
  PlanItem,
  PRItem,
  ProjectSnapshot,
} from "@/lib/types";
import { checkBriefing, checkNarrative, type Violation } from "@/lib/llm-guard";
import {
  distinctByProject,
  groupNeeds,
  humanAsksFor,
  inferNeedTag,
  type NeedEntry,
  type NeedGroup,
} from "@/lib/aggregate";
import { extractThemes, themeSummary } from "@/lib/themes";
import { parseBusinessCase, type Valuation } from "@/lib/businesscase";
import type { Growth } from "@/lib/growth";
import type { QualityScorecard } from "@/lib/scorecard";
import {
  headlinePct,
  kindLabel,
  milestoneTitle,
  nextMilestone,
  nextMilestoneShort,
  pluralize,
} from "@/lib/utils";

export type { Valuation };

export interface Narrative {
  /** Punchy 3–7 word headline — the glanceable "what's the story". */
  headline: string;
  text: string;
  source: "llm" | "template";
  /** Model used when source === "llm". */
  model?: string;
  /** Why the LLM path fell back to a template (diagnostic; source === "template"). */
  llmReason?: string;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Bump to invalidate cached narratives/briefings/valuations after a logic
// change — unstable_cache entries otherwise survive across deploys (which is
// why an old wrong ARR could persist even after fixing the parser).
// v9: briefing attention count = grouped "Needs you" cards (matches the badge);
//     factoryContext drops per-project ask counts so the prose can't contradict it.
const CACHE_VERSION = "v10";

/** True during `next build` (prerender). Used to skip external LLM calls. */
function buildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

// Google Gemini, preferred when set. gemini-2.5-flash-lite is fast, cheap, and
// — crucially — does NOT "think" by default, so it returns the digest text
// within a small output-token budget. (The auto-tracking "gemini-flash-latest"
// alias pointed at a reasoning model that spent the whole maxOutputTokens budget
// on internal thinking and came back empty with finishReason MAX_TOKENS.)
const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash-lite";
// If a pinned GEMINI_MODEL is retired (404), retry once with this model.
const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite";
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
  "You are the writer for a dashboard an operator skims each morning. For one " +
  "autonomous software project (a scheduled coding agent ships code to it), " +
  "write a short status note the way a sharp teammate would tell you what " +
  "happened — not a report generator. Respond in EXACTLY this format, nothing " +
  "else:\n" +
  "HEADLINE: <a punchy 3-7 word headline, no trailing period>\n" +
  "DIGEST: <2 sentences: what the last day of work was really about and where " +
  "the project stands, then the single most useful thing coming next>\n\n" +
  "VOICE (this is what separates a real read from a metrics readout):\n" +
  "- Lead with the SUBSTANCE of the work — what it was for, what got better — " +
  "NOT a PR count. Do not open with '<N> PRs shipped…'; a count is background, " +
  "fold it in later only if it earns its place.\n" +
  "- Do NOT follow a fixed template. In particular, avoid the shape '<N> PRs " +
  "shipped …, including X and Y, bringing readiness to Z%.' Vary how each " +
  "update opens and how the sentences are built.\n" +
  "- Be concrete: name the actual work from the shipped PR titles / roadmap " +
  "(e.g. 'hardened the checkout retry path'), not vague buckets like " +
  "'performance improvements'.\n\n" +
  "GROUNDING RULES (critical — accuracy over enthusiasm):\n" +
  "- There are THREE independent axes; never conflate them: submission " +
  "readiness % (the Definition-of-Done gate — the real 'how done is it'), build " +
  "completeness % (track checkboxes), and estimated revenue. Shipping many PRs " +
  "does NOT mean it's almost done.\n" +
  "- Do NOT say 'nearing completion', 'almost done', 'ready', 'launch-ready', " +
  "'production-ready', or similar UNLESS submission readiness is at least 80% " +
  "or it is explicitly flagged ready for submission. When readiness is low it " +
  "is EARLY — frame it as momentum and what's next, not nearness to done.\n" +
  "- Never say the product is launched/live/in production; it has not shipped " +
  "to users.\n" +
  "- Be specific and grounded only in the data given; never invent features or " +
  "numbers.\n" +
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
  // Short label so the one-line digest never truncates mid-sentence.
  const milestone = nextMilestoneShort(s);
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

interface LlmOutcome {
  text?: string;
  model?: string;
  /** Short diagnostic reason when text is absent (or "ok"). */
  reason: string;
}

function clipMsg(s: string, n = 70): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function errReason(e: unknown): string {
  const s = String(e);
  if (/abort|timeout|timed out/i.test(s)) return "timeout";
  if (e instanceof Error && e.message) return clipMsg(e.message, 40);
  return "network error";
}

/** Single OpenRouter chat call. */
async function callOpenRouter(
  messages: ChatMessage[],
  maxTokens: number,
): Promise<LlmOutcome> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { reason: "no-key" };

  const model = process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL;
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "AutoFactoryDashboard",
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.6, messages }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) {
      let detail = "";
      try {
        const j = (await res.json()) as { error?: { message?: string } };
        if (j?.error?.message) detail = `: ${clipMsg(j.error.message)}`;
      } catch {}
      return { reason: `openrouter HTTP ${res.status}${detail}` };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text ? { text, model, reason: "ok" } : { reason: "openrouter returned empty" };
  } catch (e) {
    return { reason: `openrouter ${errReason(e)}` };
  }
}

/** One Gemini call against a specific model (Generative Language REST API). */
async function geminiCall(
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  maxTokens: number,
): Promise<LlmOutcome & { status?: number }> {
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
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.6 },
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) {
      let detail = "";
      try {
        const j = (await res.json()) as { error?: { message?: string } };
        if (j?.error?.message) detail = `: ${clipMsg(j.error.message)}`;
      } catch {}
      return { reason: `gemini HTTP ${res.status}${detail}`, status: res.status };
    }
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      promptFeedback?: { blockReason?: string };
    };
    const cand = data.candidates?.[0];
    const text = cand?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (text) return { text, model, reason: "ok" };
    const block = data.promptFeedback?.blockReason || cand?.finishReason;
    return { reason: block ? `gemini empty (${block})` : "gemini empty" };
  } catch (e) {
    return { reason: `gemini ${errReason(e)}` };
  }
}

// Transient server-side failures worth a quick retry: 503 "high demand"
// (model overloaded), 429 (rate limited), and other 5xx. NOT 400/403/404 (bad
// key / permission / wrong model) or an empty MAX_TOKENS reply — retrying those
// just wastes time.
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Google Gemini call. Uses GEMINI_MODEL (or the default). On a transient
 * overload (503/429/5xx) it backs off briefly and retries the same model — the
 * spike usually passes in well under a second. On a 404 (retired/unknown model)
 * it retries once with the fallback model so a pinned-version retirement
 * self-heals instead of going dark.
 */
async function callGemini(
  messages: ChatMessage[],
  maxTokens: number,
): Promise<LlmOutcome> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { reason: "no-key" };

  const model = process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
  let out = await geminiCall(model, apiKey, messages, maxTokens);

  for (
    let attempt = 1;
    attempt <= 2 &&
    !out.text &&
    out.status !== undefined &&
    TRANSIENT_STATUS.has(out.status);
    attempt++
  ) {
    await sleep(300 * attempt); // 300ms, then 600ms
    out = await geminiCall(model, apiKey, messages, maxTokens);
  }

  if (!out.text && out.status === 404 && model !== GEMINI_FALLBACK_MODEL) {
    return geminiCall(GEMINI_FALLBACK_MODEL, apiKey, messages, maxTokens);
  }
  return out;
}

/**
 * Provider-agnostic LLM call. Prefers Gemini when GEMINI_API_KEY is set, falls
 * back to OpenRouter. Carries a short diagnostic reason for the UI.
 */
async function callLLM(messages: ChatMessage[], maxTokens: number): Promise<LlmOutcome> {
  // Never make external LLM calls during `next build` — keeps the deploy build
  // fast and immune to API hangs/errors. (The UI-facing callers also short-
  // circuit before their cache during build; this is a defensive backstop.)
  if (buildPhase()) return { reason: "build" };

  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  if (!hasGemini && !hasOpenRouter) return { reason: "no LLM key set" };

  if (hasGemini) {
    const g = await callGemini(messages, maxTokens);
    if (g.text || !hasOpenRouter) return g;
    const o = await callOpenRouter(messages, maxTokens);
    return o.text ? o : { reason: `${g.reason}; ${o.reason}` };
  }
  return callOpenRouter(messages, maxTokens);
}

/**
 * Generate text, then fact-check it against the real numbers. A violation
 * triggers ONE corrective retry that names the specific problem; if the retry
 * still fails (or the model is unavailable), we return no text so the caller
 * falls back to the grounded template — an honest template beats an overstated
 * digest (e.g. "nearing completion" at 0% submission-ready). The diagnostic
 * reason becomes `guard:<rule>`, which the UI surfaces next to "Summary".
 */
async function generateGuarded(
  messages: ChatMessage[],
  maxTokens: number,
  validate: (text: string) => Violation[],
): Promise<LlmOutcome> {
  const first = await callLLM(messages, maxTokens);
  if (!first.text) return first;
  const violations = validate(first.text);
  if (violations.length === 0) return first;

  const note =
    "REVISION NEEDED — your previous draft was inaccurate:\n" +
    violations.map((v) => `- ${v.message}`).join("\n") +
    "\nRewrite it in the same required format, fixing these problems. Stay strictly grounded in the numbers given.";
  const retry = await callLLM(
    [...messages, { role: "user", content: `Your previous draft:\n${first.text}\n\n${note}` }],
    maxTokens,
  );
  if (retry.text && validate(retry.text).length === 0) return { ...retry, reason: "ok" };

  return { reason: `guard:${violations[0].rule}` };
}

export interface LlmHealth {
  /** True when the configured provider returned text. */
  ok: boolean;
  provider: "gemini" | "openrouter" | "none";
  model: string;
  /** Whether each key is visible to this deployment (NOT the key value). */
  geminiKey: boolean;
  openrouterKey: boolean;
  /** Short diagnostic reason (e.g. "ok", "no LLM key set", "gemini HTTP 400: …"). */
  reason: string;
  /** A snippet of the model's reply, proving it's real (when ok). */
  sample?: string;
  /** Human hint on how to fix a failure. */
  hint?: string;
}

/**
 * Live check of the configured LLM path — runs the SAME callLLM the digests
 * use, so it reflects exactly what the deployed app can reach at runtime.
 * Surfaced via GET /api/llm-health (auth-gated).
 */
export async function checkLlmHealth(): Promise<LlmHealth> {
  const geminiKey = Boolean(process.env.GEMINI_API_KEY);
  const openrouterKey = Boolean(process.env.OPENROUTER_API_KEY);
  const provider = geminiKey ? "gemini" : openrouterKey ? "openrouter" : "none";

  const out = await callLLM(
    [
      { role: "system", content: "You are a health check. Reply with a single short word." },
      { role: "user", content: "Reply with the word OK." },
    ],
    64, // headroom so a model with any token overhead still emits visible text
  );
  const ok = Boolean(out.text);

  let hint: string | undefined;
  if (!ok) {
    hint =
      provider === "none"
        ? "No GEMINI_API_KEY / OPENROUTER_API_KEY is visible to this deployment. In Vercel, enable the variable for THIS environment (a branch deploy is 'Preview', not 'Production') and redeploy — env-var changes don't apply to existing deployments."
        : `The ${provider} call failed (${out.reason}). 400 = bad key, 403 = API not enabled/restricted, 404 = wrong model name, 429 = quota.`;
  }

  return {
    ok,
    provider,
    model: currentModel(),
    geminiKey,
    openrouterKey,
    reason: out.reason,
    sample: out.text ? clipMsg(out.text, 60) : undefined,
    hint,
  };
}

/**
 * Per-project narrative. Uses OpenRouter when OPENROUTER_API_KEY is set,
 * otherwise a templated summary. Never throws; never blocks the page beyond a
 * short timeout. Cached ~10 min, keyed on the metrics that would change it.
 */
export function getNarrative(s: ProjectSnapshot): Promise<Narrative> {
  // During `next build`, return the template directly WITHOUT caching it, so the
  // build never persists a placeholder into the Data Cache (an SWR cache could
  // otherwise serve that build-time template for a cycle or two after deploy).
  // At runtime the first render is a clean cache miss → real LLM → AI digest.
  // No llmReason: a transient build skip isn't an error worth surfacing.
  if (buildPhase()) {
    return Promise.resolve({
      headline: templateHeadline(s),
      text: templateNarrative(s),
      source: "template",
    });
  }

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
      const out = await generateGuarded(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Write the update from these metrics:\n\n${llmContext(s)}` },
        ],
        320, // headroom so a 2-sentence digest never gets cut off mid-thought
        (text) =>
          checkNarrative(text, {
            readinessPct: headlinePct(s),
            buildPct: s.progress.buildPct,
            readyForSubmission: s.readyForSubmission,
          }),
      );
      if (out.text) {
        const { headline, text } = parseHeadlineDigest(out.text);
        return {
          headline: headline || templateHeadline(s),
          text,
          source: "llm",
          model: out.model,
        };
      }
      return {
        headline: templateHeadline(s),
        text: templateNarrative(s),
        source: "template",
        llmReason: out.reason,
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
  "markdown, no lists, no preamble.\n" +
  "Accuracy over enthusiasm: only call a project ready/done/launched if the " +
  "data marks it ready for submission. These are works in progress — do not " +
  "imply they are finished or live.\n" +
  "If you mention how many things need the owner's attention, use ONLY the single " +
  "total given in the user message — never break it into per-project counts or " +
  "invent a number (the UI shows that total separately, so they must match).";

function factoryContext(snapshots: ProjectSnapshot[]): string {
  return snapshots
    .map((s) => {
      const pct = headlinePct(s);
      const focus = themeSummary(extractThemes(s.merged7dItems));
      // Qualitative "needs attention" flag, NOT a per-project count — the only
      // attention NUMBER the model gets is the grouped total in the user message,
      // so its prose can't contradict the masthead badge with per-project tallies.
      const needsYou = humanAsksFor(s).length > 0;
      return (
        `- ${s.displayName}: ${s.status}, ${s.merged24h} merged in 24h, ` +
        `${pct ?? "?"}% through roadmap, CI ${s.ci.status}` +
        (needsYou ? `, needs your attention` : "") +
        (focus ? `; focus: ${focus}` : "")
      );
    })
    .join("\n");
}

export interface FactoryBriefing {
  text: string;
  source: "llm" | "template";
}

function templateBriefing(snapshots: ProjectSnapshot[], needs: number): string {
  const totalMerged = snapshots.reduce((n, s) => n + s.merged24h, 0);
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
  /**
   * Number of grouped "Needs you" cards the Floor actually renders. Passed in so
   * the briefing's "N items need your attention" matches the masthead badge and
   * the list exactly. Falls back to the deterministic grouped count.
   */
  attentionCount?: number,
): Promise<FactoryBriefing> {
  const totalMerged = snapshots.reduce((n, s) => n + s.merged24h, 0);
  const needs = attentionCount ?? groupNeeds(snapshots.flatMap(humanAsksFor)).length;

  // See getNarrative: skip the LLM (and the cache) during build.
  if (buildPhase()) {
    return Promise.resolve({ text: templateBriefing(snapshots, needs), source: "template" });
  }

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
      const anyReady = snapshots.some((s) => s.readyForSubmission);
      const llm = await generateGuarded(
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
        (text) => checkBriefing(text, { anyReady }),
      );
      if (llm.text) return { text: llm.text, source: "llm" };
      return { text: templateBriefing(snapshots, needs), source: "template" };
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
  // See getNarrative: skip the LLM (and the cache) during build.
  if (buildPhase()) return Promise.resolve(templateLaunch(s));

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
      if (llm.text) {
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
// Action plan — PENDING_OPS re-organised into a calm, prioritised checklist
// ────────────────────────────────────────────────────────────────────────────

const PLAN_PRIORITY_ORDER: Record<ActionPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
};

const PRIORITIES: ActionPriority[] = ["urgent", "high", "normal"];

// Needs human-only access — credentials, signing, billing, production, stores.
const HUMAN_RE =
  /\b(human|manual|secret|credential|signing|sign-?off|app ?store|play ?store|testflight|billing|spend|prod(?:uction)?\b.*\bmigrat|api[- ]?key|token|2fa|owner|store account)\b/i;

function firstSentence(s: string, max = 150): string {
  const t = s.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.*?[.!?])(?:\s|$)/);
  const out = m ? m[1] : t;
  return out.length > max ? `${out.slice(0, max).trim()}…` : out;
}

function cleanTitle(text: string, max = 62): string {
  let t = text.replace(/\s+/g, " ").trim();
  // Drop leading urgency markers ("URGENT:", "NOW —", "[P0]") — the priority
  // band already conveys that, so they're just noise in the title.
  t = t
    .replace(
      /^(?:\[?\s*(?:urgent|now|asap|important|critical|p0|p1|todo|do first|action|fixme)\s*[)\]:.—-]*\s*)+/i,
      "",
    )
    .replace(/[.:]+$/, "")
    .trim();
  if (t) t = t.charAt(0).toUpperCase() + t.slice(1);
  // Clip at a word boundary, never mid-word.
  if (t.length > max) t = `${t.slice(0, max).replace(/\s+\S*$/, "").trim()}…`;
  return t;
}

/** Heuristic one-word category from the item text. */
function inferTag(text: string): string {
  const t = text.toLowerCase();
  if (/\b(app ?store|play ?store|eas|testflight|submit|signing)\b/.test(t)) return "store";
  if (/\b(bill|spend|cost|budget|stripe|quota|cap)\b/.test(t)) return "billing";
  if (/\b(secret|api[- ]?key|token|auth|security|expose|credential)\b/.test(t)) return "security";
  if (/\b(deploy|vercel|prod|domain|env\b)\b/.test(t)) return "deploy";
  if (/\b(ci|workflow|pipeline|e2e|lint|test suite)\b/.test(t)) return "ci";
  if (/\b(migrat|database|postgres|schema|\bdb\b)\b/.test(t)) return "data";
  if (/\b(waitlist|launch|market|email|seo|growth)\b/.test(t)) return "growth";
  return "ops";
}

/** Deterministic cleanup — always available, used when the LLM can't run. */
function templateActionPlan(items: ActionItem[]): ActionPlan {
  const planItems: PlanItem[] = items.map((it) => {
    const fullText = [it.text, it.howTo].filter(Boolean).join(" — ");
    const detail = it.why
      ? firstSentence(it.why)
      : it.howTo
        ? firstSentence(it.howTo)
        : "";
    return {
      id: it.id,
      title: cleanTitle(it.text),
      detail,
      fullText,
      priority: it.priority ?? "normal",
      tag: inferTag(fullText),
      humanOnly: HUMAN_RE.test(fullText),
    };
  });
  planItems.sort((a, b) => PLAN_PRIORITY_ORDER[a.priority] - PLAN_PRIORITY_ORDER[b.priority]);
  return { available: planItems.length > 0, items: planItems, source: "template" };
}

const PLAN_SYSTEM =
  "You are an operations editor for an autonomous software project's action " +
  "queue. You'll get a numbered list of raw action items (each may have a " +
  "title, how-to detail, why, and priority). Re-organise the queue to be calm " +
  "and scannable WITHOUT losing meaning or inventing anything. For EACH input " +
  "item output an object with:\n" +
  '- "n": the item number, echoed exactly\n' +
  '- "title": a crisp imperative, 8 words or fewer\n' +
  '- "detail": ONE plain-language sentence — what to do and why it matters\n' +
  '- "priority": "urgent" | "high" | "normal" (keep the given one if present)\n' +
  '- "tag": one short category word (deploy, billing, store, ci, security, data, growth, ops)\n' +
  '- "humanOnly": true if it needs human-only access (production secrets, ' +
  "signing, billing, store accounts, prod migrations), else false\n" +
  'Also output "summary": ONE sentence on what to tackle first and the theme ' +
  "of the rest. Return ONLY valid minified JSON: " +
  '{"summary":"...","items":[{"n":1,"title":"...","detail":"...","priority":"...","tag":"...","humanOnly":false}]}. ' +
  "Every input item must appear exactly once; do not add or drop items.";

interface RawPlanItem {
  n?: number;
  title?: string;
  detail?: string;
  priority?: string;
  tag?: string;
  humanOnly?: boolean;
}

/** Extract the JSON object from a model reply (tolerant of code fences/prose). */
function parsePlanJson(raw: string): { summary?: string; items: RawPlanItem[] } | null {
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    const o = JSON.parse(raw.slice(a, b + 1)) as { summary?: string; items?: RawPlanItem[] };
    return o && Array.isArray(o.items) ? { summary: o.summary, items: o.items } : null;
  } catch {
    return null;
  }
}

/**
 * Re-organise PENDING_OPS into a prioritised, scannable plan. The LLM only
 * *clarifies and orders* — every entry maps back to a real action item (its id,
 * full original text, and checkbox state are preserved), so nothing is invented
 * or lost. Falls back to a deterministic cleanup when the LLM can't run. Cached.
 */
export function getActionPlan(s: ProjectSnapshot): Promise<ActionPlan> {
  const items = (s.actionItems.available ? s.actionItems.items : []).slice(0, 20);
  if (items.length === 0) {
    return Promise.resolve({ available: false, items: [], source: "template" });
  }
  if (buildPhase()) return Promise.resolve(templateActionPlan(items));

  const cacheKey = [
    "afd-actionplan",
    CACHE_VERSION,
    s.slug,
    currentModel(),
    items.map((i) => i.id).join(","),
  ];

  return unstable_cache(
    async (): Promise<ActionPlan> => {
      const numbered = items
        .map((it, i) => {
          const lines = [`${i + 1}. ${it.text}`];
          if (it.howTo) lines.push(`   detail: ${clip(it.howTo, 360)}`);
          if (it.why) lines.push(`   why: ${clip(it.why, 200)}`);
          if (it.priority) lines.push(`   priority: ${it.priority}`);
          return lines.join("\n");
        })
        .join("\n");

      const out = await callLLM(
        [
          { role: "system", content: PLAN_SYSTEM },
          { role: "user", content: `Action items:\n${numbered}` },
        ],
        // Headroom for up to 20 items of structured JSON (~70 tokens each) —
        // too small a budget truncates the JSON, fails to parse, and silently
        // drops the whole plan to the deterministic "Organized" fallback.
        1900,
      );
      const parsed = out.text ? parsePlanJson(out.text) : null;
      if (!parsed) return templateActionPlan(items);

      const byN = new Map(parsed.items.filter((p) => typeof p.n === "number").map((p) => [p.n, p]));
      const planItems: PlanItem[] = items.map((it, i) => {
        const p = byN.get(i + 1);
        const fullText = [it.text, it.howTo].filter(Boolean).join(" — ");
        const priority = (PRIORITIES as string[]).includes(p?.priority ?? "")
          ? (p!.priority as ActionPriority)
          : it.priority ?? "normal";
        return {
          id: it.id,
          title: p?.title?.trim() || cleanTitle(it.text),
          detail:
            p?.detail?.trim() ||
            (it.why ? firstSentence(it.why) : it.howTo ? firstSentence(it.howTo) : ""),
          fullText,
          priority,
          tag: p?.tag?.trim().toLowerCase() || inferTag(fullText),
          humanOnly: typeof p?.humanOnly === "boolean" ? p.humanOnly : HUMAN_RE.test(fullText),
        };
      });
      planItems.sort((a, b) => PLAN_PRIORITY_ORDER[a.priority] - PLAN_PRIORITY_ORDER[b.priority]);
      return { available: true, summary: parsed.summary?.trim(), items: planItems, source: "llm" };
    },
    cacheKey,
    { revalidate: 600 },
  )();
}

// ────────────────────────────────────────────────────────────────────────────
// Needs-you organiser — cluster owner actions across projects (LLM, guarded)
// ────────────────────────────────────────────────────────────────────────────

const NEEDS_SYSTEM =
  "You organise an operator's cross-project action queue for autonomous " +
  "software projects. You'll get a numbered list of owner actions, each " +
  "prefixed with its project. GROUP actions that are the SAME underlying task " +
  "— even if worded differently or naming different providers (e.g. 'set API " +
  "spend caps' across several projects is ONE group). Keep genuinely different " +
  "tasks in separate groups. For each group output:\n" +
  '- "title": a crisp canonical action, 8 words or fewer\n' +
  '- "detail": ONE plain-language sentence — the shared gist\n' +
  '- "refs": the item numbers in this group\n' +
  '- "priority": "urgent" | "high" | "normal"\n' +
  '- "tag": one short category word (billing, deploy, store, ci, security, data, growth, ops)\n' +
  "Every input number must appear in EXACTLY ONE group's refs — never drop, " +
  "duplicate, or invent. Order groups most urgent first. Return ONLY minified " +
  'JSON: {"groups":[{"title":"…","detail":"…","refs":[1,3],"priority":"urgent","tag":"billing"}]}.';

interface RawNeedGroup {
  title?: string;
  detail?: string;
  refs?: number[];
  priority?: string;
  tag?: string;
}

function parseNeedsJson(raw: string): { groups: RawNeedGroup[] } | null {
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    const o = JSON.parse(raw.slice(a, b + 1)) as { groups?: RawNeedGroup[] };
    return o && Array.isArray(o.groups) ? { groups: o.groups } : null;
  } catch {
    return null;
  }
}

/**
 * Map the LLM's clusters back to real NeedEntries. Structural guard: every input
 * item must be assigned exactly once (no drop / duplicate / invented index) or
 * we reject the whole thing and the caller falls back to deterministic grouping.
 */
function mapNeedGroups(
  parsed: { groups: RawNeedGroup[] },
  needs: NeedEntry[],
): NeedGroup[] | null {
  const seen = new Set<number>();
  const groups: NeedGroup[] = [];
  for (const g of parsed.groups) {
    const refs = (g.refs ?? []).filter(
      (r) => Number.isInteger(r) && r >= 1 && r <= needs.length,
    );
    if (refs.length === 0) continue;
    const members: NeedEntry[] = [];
    for (const r of refs) {
      if (seen.has(r)) return null; // duplicate assignment → invalid
      seen.add(r);
      members.push(needs[r - 1]);
    }
    // Distinct projects only — the LLM may cluster several of ONE project's asks
    // into a group; they must not render as repeated chips or inflate "N projects".
    const distinct = distinctByProject(members);
    const byPriority = [...distinct].sort((a, b) => a.priority - b.priority);
    const title = g.title?.trim() || byPriority[0].text;
    groups.push({
      id: distinct.length > 1 ? `grp:${byPriority[0].id}` : byPriority[0].id,
      text: title,
      howTo: g.detail?.trim() || byPriority[0].howTo,
      url: distinct.length === 1 ? byPriority[0].url : undefined,
      kind: byPriority[0].kind,
      priority: Math.min(...distinct.map((m) => m.priority)),
      tag: g.tag?.trim().toLowerCase() || inferNeedTag(`${title} ${byPriority[0].howTo ?? ""}`),
      members: byPriority,
    });
  }
  if (seen.size !== needs.length) return null; // incomplete coverage → invalid
  return groups.sort(
    (a, b) => a.priority - b.priority || b.members.length - a.members.length,
  );
}

/**
 * Organise the cross-project "Needs you" list: cluster the same task across
 * projects and give each group a clean canonical title. The LLM only clusters
 * and labels — every action maps back to a real NeedEntry (project, link, id
 * preserved), and a structural guard rejects any drop/duplicate, falling back
 * to the deterministic `groupNeeds`. Cached; degrades cleanly with no LLM.
 */
export function getNeedsPlan(needs: NeedEntry[]): Promise<NeedGroup[]> {
  // 1 item (or none): nothing to organise. Build phase: skip the LLM.
  if (needs.length <= 1 || buildPhase()) {
    return Promise.resolve(groupNeeds(needs));
  }

  const cacheKey = [
    "afd-needsplan",
    CACHE_VERSION,
    currentModel(),
    needs.map((n) => n.id).join(","),
  ];

  return unstable_cache(
    async (): Promise<NeedGroup[]> => {
      const numbered = needs
        .map(
          (n, i) =>
            `${i + 1}. [${n.projectName}] ${n.text}${n.howTo ? ` — ${clip(n.howTo, 200)}` : ""}`,
        )
        .join("\n");
      const out = await callLLM(
        [
          { role: "system", content: NEEDS_SYSTEM },
          { role: "user", content: `Owner actions:\n${numbered}` },
        ],
        // Headroom so the grouped JSON never truncates (→ deterministic fallback).
        1200,
      );
      const parsed = out.text ? parseNeedsJson(out.text) : null;
      const mapped = parsed ? mapNeedGroups(parsed, needs) : null;
      return mapped ?? groupNeeds(needs); // guard failed → deterministic grouping
    },
    cacheKey,
    { revalidate: 600 },
  )();
}

// ────────────────────────────────────────────────────────────────────────────
// Product tagline — a stable one-liner "what this product is" (LLM, README-led)
// ────────────────────────────────────────────────────────────────────────────

const TAGLINE_SYSTEM =
  "You write a one-line product tagline for a dashboard. In ONE sentence of " +
  "14 words or fewer, say what this product IS and who it's for — its purpose, " +
  "not its progress, status, or tech stack. Concrete and plain; no marketing " +
  "fluff, no 'this app/project/repo', no emoji. Ground it ONLY in the provided " +
  "repo docs; never invent features. Output ONLY the sentence.";

function taglineContext(s: ProjectSnapshot): string {
  const readme =
    s.files.readme.available && s.files.readme.content
      ? clip(s.files.readme.content, 2000)
      : "";
  const roadmap =
    !readme && s.files.roadmap.available && s.files.roadmap.content
      ? clip(s.files.roadmap.content, 800)
      : "";
  return [
    `Product name: ${s.displayName} (${kindLabel(s.kind)})`,
    readme ? `README.md:\n${readme}` : "",
    roadmap ? `ROADMAP.md (excerpt):\n${roadmap}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Deterministic fallback: the first real prose sentence of the README. */
function readmeTagline(readme: string): string | null {
  for (const raw of readme.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // Skip headings, quotes, images, lists, tables, html, code fences, badges.
    if (/^[#>!\-*=|`<]/.test(line)) continue;
    if (/^\[!\[/.test(line) || /shields\.io|badge|!\[/i.test(line)) continue;
    const m = line.match(/^(.*?[.!?])(?:\s|$)/);
    const sent = (m ? m[1] : line).replace(/[*_`[\]()]/g, "").replace(/\s+/g, " ").trim();
    if (sent.length >= 14 && sent.length <= 200) {
      return sent.length > 160 ? `${sent.slice(0, 160).replace(/\s+\S*$/, "").trim()}…` : sent;
    }
  }
  return null;
}

/**
 * A stable "what this product is" tagline for the tiles. LLM-written from the
 * README (so it tracks the product as it evolves), cached on the README's
 * commit SHA so it only regenerates when the description actually changes —
 * cheap. Falls back to the README's first sentence, then null (hide the line).
 */
export function getProjectTagline(s: ProjectSnapshot): Promise<string | null> {
  const readme = s.files.readme;
  const hasReadme = Boolean(readme.available && readme.content);
  const hasRoadmap = Boolean(s.files.roadmap.available && s.files.roadmap.content);
  if (!hasReadme && !hasRoadmap) return Promise.resolve(null);

  if (buildPhase()) {
    return Promise.resolve(hasReadme ? readmeTagline(readme.content!) : null);
  }

  const cacheKey = [
    "afd-tagline",
    CACHE_VERSION,
    s.slug,
    currentModel(),
    // Identity changes only when the README (or roadmap fallback) changes.
    readme.lastCommitSha ?? String(readme.content?.length ?? 0),
    String(s.files.roadmap.content?.length ?? 0),
  ];

  return unstable_cache(
    async (): Promise<string | null> => {
      const out = await callLLM(
        [
          { role: "system", content: TAGLINE_SYSTEM },
          { role: "user", content: taglineContext(s) },
        ],
        60, // a one-sentence tagline needs almost nothing
      );
      if (out.text) {
        let t = out.text
          .replace(/\s+/g, " ")
          .trim()
          .replace(/^["'“”]+|["'“”]+$/g, "")
          .trim();
        if (t.length > 140) t = `${t.slice(0, 140).replace(/\s+\S*$/, "").trim()}…`;
        if (t.length >= 8) return t;
      }
      return hasReadme ? readmeTagline(readme.content!) : null;
    },
    cacheKey,
    { revalidate: 86_400 }, // daily; the SHA in the key busts it on any change
  )();
}

// ────────────────────────────────────────────────────────────────────────────
// Last-run summary — one AI sentence for what the most recent run did, read
// from the FULL pull request (title + description). Falls back to the PR title.
// ────────────────────────────────────────────────────────────────────────────

export interface LastRunSummary {
  /** One sentence: what the last run did. AI when a description exists, else the title. */
  text: string;
  source: "llm" | "template";
  /** Diagnostic when the LLM was skipped/failed (mirrors Narrative.llmReason). */
  llmReason?: string;
}

const LAST_RUN_SYSTEM =
  "You explain a SINGLE pull request to the busy, NON-engineer founder of an " +
  "autonomous product factory, so they understand what just happened without " +
  "reading any code. Write 2-3 short, plain, friendly sentences with NO jargon — " +
  "translate technical terms into their everyday meaning (e.g. 'OOM' → 'the app " +
  "running out of memory and crashing', 'RLS' → 'per-user data-access rules', " +
  "'middleware' → 'the code that runs on every request'). Cover, in order: " +
  "(1) what the run changed, in plain terms; (2) why — the problem it fixes or " +
  "the goal it serves; and (3) what the factory will most likely work on next. " +
  "For (3), anticipate CONFIDENTLY and specifically by combining any next-steps " +
  "the PR mentions with the 'What's queued next' section (the project's real " +
  "roadmap milestone, the pull requests open right now, and any growth actions) — " +
  "name the concrete next focus in plain terms, phrased as an expectation " +
  "('next, it will likely …'). Ground everything in the material given: never " +
  "invent features, metrics, or facts, and use only numbers that literally appear " +
  "there. Lead with the change itself — do NOT begin with \"This PR\" or \"This " +
  'change". Plain prose, no markdown, no headings, no PR number.';

/**
 * What the factory is teed up to work on next — the project's real roadmap
 * milestone, its in-flight PRs, and any growth actions. Feeds beat (3) of the
 * last-run summary so "what's next" is a grounded forecast, not a guess.
 */
function forwardContext(s: ProjectSnapshot): string {
  const parts: string[] = [];
  const milestone = nextMilestone(s);
  if (milestone) parts.push(`Next roadmap milestone: ${milestoneTitle(milestone, 160)}`);
  const inFlight = s.openPRs
    .slice(0, 5)
    .map((p) => `- ${clip(p.title, 100)}${p.draft ? " (draft)" : ""}`);
  if (inFlight.length) {
    parts.push(`Pull requests open right now (work in progress):\n${inFlight.join("\n")}`);
  }
  const gtmNext = s.growth.available ? s.growth.nextActions.slice(0, 3) : [];
  if (gtmNext.length) {
    parts.push(`Growth next actions:\n${gtmNext.map((a) => `- ${clip(a, 120)}`).join("\n")}`);
  }
  return parts.join("\n\n");
}

function lastRunContext(pr: PRItem, projectName: string, forward: string): string {
  return [
    `Project: ${projectName}`,
    `PR title: ${pr.title}`,
    "",
    "PR description:",
    clip((pr.body ?? "").trim() || "(no description provided)", 2400),
    forward
      ? `\nWhat's queued next for this project (use this to anticipate what the factory works on next):\n${forward}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Flag an invented multi-digit number — a metric the PR never actually stated. */
function checkLastRun(text: string, sourceText: string): Violation[] {
  const src = sourceText.replace(/,/g, "");
  const invented = [...new Set(text.match(/\d{2,}/g) ?? [])].filter(
    (n) => !src.includes(n),
  );
  return invented.length
    ? [
        {
          rule: "invented-number",
          message: `The number "${invented[0]}" does not appear in the PR — drop it or use only figures the PR states.`,
        },
      ]
    : [];
}

function tidyLine(s: string, max = 180): string {
  let t = s
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
  if (t.length > max) t = `${t.slice(0, max).replace(/\s+\S*$/, "").trim()}…`;
  return t;
}

/**
 * One AI sentence describing what the most recent run (its merged PR) did, read
 * from the full PR title + description. Cached on the PR's URL (immutable once
 * merged) so it generates once per new run. Falls back to the PR title when
 * there's no description to read, no LLM key, or the number-guard trips.
 */
export function getLastRunSummary(
  pr: PRItem,
  s: ProjectSnapshot,
): Promise<LastRunSummary> {
  const fallback = (llmReason?: string): LastRunSummary => ({
    text: tidyLine(pr.title, 160),
    source: "template",
    ...(llmReason ? { llmReason } : {}),
  });

  const body = (pr.body ?? "").trim();
  // Nothing more to read than the title → the title IS the summary (no LLM cost).
  if (body.length < 24) return Promise.resolve(fallback());
  if (buildPhase()) return Promise.resolve(fallback());

  const forward = forwardContext(s);
  const cacheKey = [
    "afd-lastrun4",
    CACHE_VERSION,
    currentModel(),
    pr.url, // immutable per merged PR — the "what/why" is frozen per run
    String(body.length),
    // Regenerate the forecast when the queued-next picture shifts materially.
    nextMilestone(s) ?? "",
    String(s.openPRs.length),
  ];

  return unstable_cache(
    async (): Promise<LastRunSummary> => {
      const out = await generateGuarded(
        [
          { role: "system", content: LAST_RUN_SYSTEM },
          { role: "user", content: lastRunContext(pr, s.displayName, forward) },
        ],
        320, // headroom for 2-3 plain-language sentences (what · why · likely next)
        (text) => checkLastRun(text, `${pr.title}\n${body}`),
      );
      if (out.text) {
        // Generous cap — the summary must never truncate mid-thought in the UI.
        const t = tidyLine(out.text, 700);
        if (t.length >= 8) return { text: t, source: "llm" };
      }
      return fallback(out.reason);
    },
    cacheKey,
    { revalidate: 86_400 },
  )();
}

// ────────────────────────────────────────────────────────────────────────────
// Audit summary — a plain-language read of an auditor's top gaps (the raw
// findings are written for engineers). Returns null → caller shows the raw gap.
// ────────────────────────────────────────────────────────────────────────────

const AUDIT_SYSTEM =
  "You explain a software or go-to-market quality audit's findings to a busy, " +
  "NON-engineer founder. In 1-2 short, plain, friendly sentences with NO jargon " +
  "(translate technical terms into their everyday meaning), say what the main " +
  "thing to improve is and why it matters. Do NOT restate the letter grade. " +
  "Ground strictly in the gaps given — never invent findings or numbers. Plain " +
  "prose, no markdown, no lists, no headings.";

/**
 * Turn an auditor's top gaps (engineer-facing text) into one or two plain
 * sentences a founder can act on. Cached on the gap content + grade so it only
 * regenerates when the audit changes. Null when not graded / no gaps / no LLM.
 */
export function getScorecardSummary(
  sc: QualityScorecard,
  auditLabel: string,
): Promise<string | null> {
  if (!sc.available || !sc.overall || sc.topGaps.length === 0) {
    return Promise.resolve(null); // caller handles "not graded" / "no gaps"
  }
  if (buildPhase()) return Promise.resolve(null);

  const gapsText = sc.topGaps
    .slice(0, 3)
    .map((g) => `- ${g.dimension}: ${clip(g.gap, 300)}`)
    .join("\n");
  const cacheKey = [
    "afd-auditsum2",
    CACHE_VERSION,
    currentModel(),
    auditLabel,
    sc.overall,
    gapsText.slice(0, 500),
  ];

  return unstable_cache(
    async (): Promise<string | null> => {
      const out = await callLLM(
        [
          { role: "system", content: AUDIT_SYSTEM },
          {
            role: "user",
            content: `${auditLabel} — overall grade ${sc.overall}.\n\nTop gaps the auditor flagged:\n${gapsText}`,
          },
        ],
        220,
      );
      if (out.text) {
        // Generous cap so the plain-language read never truncates in the UI.
        const t = tidyLine(out.text, 600);
        if (t.length >= 8) return t;
      }
      return null;
    },
    cacheKey,
    { revalidate: 86_400 },
  )();
}

// ────────────────────────────────────────────────────────────────────────────
// Counter-signal summary — the demand-research routine's caveat log (run-by-run
// engineering notes) distilled into a plain founder-readable paragraph.
// ────────────────────────────────────────────────────────────────────────────

const COUNTER_SIGNAL_SYSTEM =
  "You summarize the caveats and counter-evidence a pre-launch market-research " +
  "routine logged while mining customer pain, for a busy, non-engineer founder. " +
  "Combine ALL the notes into 1-3 short, plain sentences: what the research could " +
  "NOT confirm or reach, and what that means for how much to trust the demand " +
  "signal. NO jargon, no run numbers, no dates, no tool names unless essential. " +
  "Ground strictly in the notes — invent nothing. Plain prose, no markdown, no lists.";

/**
 * Distill the demand routine's `disconfirming` notes (append-only, run-by-run,
 * written for engineers) into one plain paragraph. Cached on the notes. Null
 * when there are none / no LLM → caller falls back to the raw list.
 */
export function getCounterSignalSummary(updates: string[]): Promise<string | null> {
  const notes = updates.map((u) => u.trim()).filter(Boolean);
  if (notes.length === 0) return Promise.resolve(null);
  if (buildPhase()) return Promise.resolve(null);

  const joined = notes.map((n) => `- ${clip(n, 500)}`).join("\n");
  const cacheKey = [
    "afd-countersig",
    CACHE_VERSION,
    currentModel(),
    String(notes.length),
    joined.slice(0, 700),
  ];

  return unstable_cache(
    async (): Promise<string | null> => {
      const out = await callLLM(
        [
          { role: "system", content: COUNTER_SIGNAL_SYSTEM },
          { role: "user", content: `Counter-signal / caveat notes:\n${joined}` },
        ],
        240,
      );
      if (out.text) {
        const t = tidyLine(out.text, 600);
        if (t.length >= 8) return t;
      }
      return null;
    },
    cacheKey,
    { revalidate: 86_400 },
  )();
}

// ────────────────────────────────────────────────────────────────────────────
// Growth summary — one sentence distilling the GTM state (LLM, number-pinned)
// ────────────────────────────────────────────────────────────────────────────

export interface GrowthSummary {
  /** One sentence: GTM state + top owner next-step — for the routine digest. */
  overall: string;
  /** One sentence distilling the learnings ("What's working"); "" if none. */
  working: string;
  /** One sentence distilling the next_actions; "" if none. */
  next: string;
  source: "llm" | "template";
}

const GROWTH_SUMMARY_SYSTEM =
  "You summarize the go-to-market (GTM) state of a product built by an " +
  "autonomous agent, for the owner's at-a-glance read. Respond in EXACTLY this " +
  "format — three lines, nothing else:\n" +
  "OVERALL: <one sentence — where GTM stands + the single most important owner next-step>\n" +
  "WORKING: <one sentence — the gist of what's working, from the learnings; write 'none' if there are no learnings>\n" +
  "NEXT: <one sentence — the gist of the next actions / what's needed; write 'none' if there are none>\n" +
  "Ground STRICTLY in the data — never invent numbers, channels, metrics, or " +
  "facts; use the funnel numbers verbatim. A pre-launch product has NOT launched: " +
  "no live users/revenue unless the funnel numbers show them. Plain prose, one " +
  "sentence each, no markdown, no preamble.";

/** Tidy one model line; treat a literal "none" as empty. */
function cleanSummaryLine(s: string | undefined): string {
  if (!s) return "";
  let t = s.replace(/\s+/g, " ").trim().replace(/^["'“”]+|["'“”]+$/g, "").trim();
  if (/^none\.?$/i.test(t)) return "";
  if (t.length > 200) t = `${t.slice(0, 200).replace(/\s+\S*$/, "").trim()}…`;
  return t;
}

function growthSummaryContext(g: Growth): string {
  const f = g.funnel;
  const funnel = [
    f.waitlistSignupsTotal !== null ? `waitlist ${f.waitlistSignupsTotal}` : "",
    f.waitlistSignups7d !== null ? `+${f.waitlistSignups7d} in 7d` : "",
    f.mrrUsd !== null ? `MRR $${f.mrrUsd}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const learnings = [...g.learnings]
    .slice(-4)
    .reverse()
    .map((l) => `- ${clip(l, 320)}`)
    .join("\n");
  const nextActions = g.nextActions
    .slice(0, 5)
    .map((a) => `- ${clip(a, 220)}`)
    .join("\n");
  return [
    `Phase: ${g.phase ?? "unknown"}`,
    funnel ? `Funnel (use these numbers verbatim): ${funnel}` : "Funnel: no numbers yet",
    learnings ? `What's working (agent's learnings):\n${learnings}` : "",
    nextActions ? `Next actions / blockers:\n${nextActions}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Deterministic fallback: phase-led overall + first learning / next-action. */
function templateGrowthSummary(g: Growth): GrowthSummary {
  const phase = g.phase === "post_launch" ? "Post-launch" : "Pre-launch";
  // learnings[] is append-only — the LAST entry is the newest (per PR #14).
  const latestLearning = g.learnings[g.learnings.length - 1];
  const overall = g.nextActions[0]
    ? `${phase} — next: ${firstSentence(g.nextActions[0], 130)}`
    : latestLearning
      ? `${phase} — ${firstSentence(latestLearning, 130)}`
      : `${phase} growth work in progress.`;
  return {
    overall,
    working: latestLearning ? firstSentence(latestLearning, 150) : "",
    next: g.nextActions[0] ? firstSentence(g.nextActions[0], 150) : "",
    source: "template",
  };
}

/**
 * Three number-pinned GTM sentences from the (often long) learnings +
 * next_actions: `overall` (for the routine digest) and one-line digests of
 * `working` + `next` (the collapse-section headers). One LLM call, funnel
 * figures handed over verbatim with an explicit "never invent numbers", with a
 * deterministic fallback. All-empty when there's nothing to summarize. Cached,
 * busted on the growth content.
 */
export function getGrowthSummary(s: ProjectSnapshot): Promise<GrowthSummary> {
  const g = s.growth;
  const empty: GrowthSummary = { overall: "", working: "", next: "", source: "template" };
  if (!g.available || (g.learnings.length === 0 && g.nextActions.length === 0)) {
    return Promise.resolve(empty);
  }
  if (buildPhase()) return Promise.resolve(templateGrowthSummary(g));

  const cacheKey = [
    "afd-growthsummary2", // shape changed (3 fields) — new namespace vs the old {text}
    CACHE_VERSION,
    s.slug,
    currentModel(),
    String(g.asOf ?? ""),
    String(g.learnings.length),
    String(g.nextActions.length),
    // Bust when the lead content changes, even if counts hold — key on the NEWEST
    // learning (the one now shown), not the oldest (which never changes).
    clip((g.learnings[g.learnings.length - 1] ?? "") + "|" + (g.nextActions[0] ?? ""), 80),
  ];

  return unstable_cache(
    async (): Promise<GrowthSummary> => {
      const out = await callLLM(
        [
          { role: "system", content: GROWTH_SUMMARY_SYSTEM },
          { role: "user", content: growthSummaryContext(g) },
        ],
        220, // headroom for three sentences
      );
      if (out.text) {
        const overall = cleanSummaryLine(out.text.match(/OVERALL:\s*(.+)/i)?.[1]);
        if (overall.length >= 12) {
          return {
            overall,
            working: cleanSummaryLine(out.text.match(/WORKING:\s*(.+)/i)?.[1]),
            next: cleanSummaryLine(out.text.match(/NEXT:\s*(.+)/i)?.[1]),
            source: "llm",
          };
        }
      }
      return templateGrowthSummary(g);
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

  // Build phase + no business case: the only path here is the LLM heuristic, so
  // return the template uncached rather than persist a build placeholder. (When
  // a business case IS present, parsing is deterministic and safe to cache.)
  if (buildPhase() && !(bc?.available && bc.content)) {
    return Promise.resolve(templateValuation(s));
  }

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
        if (parsed) {
          console.info(
            `[valuation] ${s.slug}: business_case base=$${parsed.arrExpected} ` +
              `(${parsed.scenarioLabel ?? "headline"}), range $${parsed.arrLow}-$${parsed.arrHigh}, asOf=${parsed.asOf ?? "?"}`,
          );
          return parsed;
        }
        console.warn(
          `[valuation] ${s.slug}: BUSINESS_CASE.md present but unparseable/out-of-band (asOf=${bc.lastCommitDate ?? "?"})`,
        );
        return {
          arrLow: 0,
          arrExpected: 0,
          arrHigh: 0,
          rationale: "Business case present, but no plausible scenario ARR could be parsed.",
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
      if (llm.text) {
        const out = llm.text;
        const exp = parseValuationNum(out, "ARR_EXPECTED");
        if (exp !== null) {
          const low = parseValuationNum(out, "ARR_LOW");
          const high = parseValuationNum(out, "ARR_HIGH");
          const rationale =
            out.match(/RATIONALE:\s*([\s\S]+)/i)?.[1]?.trim().split("\n")[0] ?? "";
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
