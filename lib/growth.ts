/**
 * docs/growth/GROWTH_STATUS.md → Growth.
 *
 * The Growth Agent maintains a machine-readable `GROWTH_STATUS` block — a fenced
 * YAML block, exactly like `BUSINESS_CASE_SUMMARY` in docs/BUSINESS_CASE.md:
 *
 *   ```yaml
 *   GROWTH_STATUS:
 *     project: GroceryManager
 *     as_of: 2026-06-26
 *     phase: pre_launch
 *     funnel: { waitlist_signups_total: 0, mrr_usd: 0, ... }
 *     experiments: [{ id, hypothesis, status, result, lift_pct, ... }]
 *     ...
 *   ```
 *
 * Same discipline as the business case: REAL data only. We parse the block and
 * surface it; a missing or garbled block degrades to `available: false` with a
 * link to the file — never a guessed number. Pre-launch blocks are mostly
 * 0/null (correct + honest); post-launch ones fill MRR, churn, experiments.
 *
 * This needs a fuller YAML subset than businesscase.ts (block sequences of maps
 * for channels[]/experiments[]/OWNER_ACTIONS items), so it carries its own
 * indentation-aware parser rather than reusing the flat one there.
 */

import type { Availability } from "@/lib/types";

export type GrowthPhase = "pre_launch" | "launching" | "post_launch";

export interface GrowthFunnel {
  visitors7d: number | null;
  waitlistSignupsTotal: number | null;
  waitlistSignups7d: number | null;
  visitorToWaitlistRate: number | null;
  trialStartsTotal: number | null;
  paidConversionsTotal: number | null;
  trialToPaidRate: number | null;
  activeSubscribers: number | null;
  mrrUsd: number | null;
  churnRate30d: number | null;
}

export interface GrowthAcquisition {
  cacUsd: number | null;
  ltvUsd: number | null;
  ltvCacRatio: number | null;
  topChannel: string | null;
}

export interface GrowthChannel {
  name: string;
  status: string;
  reach7d: number | null;
  clicks7d: number | null;
  signups7d: number | null;
  ctr: number | null;
  notes: string;
}

export interface GrowthExperiment {
  id: string;
  hypothesis: string;
  status: string;
  result: string;
  liftPct: number | null;
  started: string;
  decided: string;
}

export interface GrowthEmail {
  listSize: number | null;
  doubleOptIn: boolean | null;
  lastStageSent: string | null;
  openRate: number | null;
  clickRate: number | null;
}

export interface GrowthContent {
  published7d: number | null;
  scheduledNext7d: number | null;
  organicSessions7d: number | null;
}

// ── Product-market fit (leading indicator) + strategic outreach ─────────────

/** The agent's honest read of a signal's strength. null == "no signal yet". */
export type GrowthSignal = "none" | "weak" | "emerging" | "strong";

/**
 * Product-market fit — the leading indicator BEHIND the business-case number.
 * Pre-PMF, the right move is a PRODUCT/retention fix, not scaling acquisition,
 * and the agent encodes that read in `signal`. REAL data only: every field is
 * null/none until a connected analytics source reports — we render that as
 * "no signal yet", never an error and never a fabricated number.
 */
export interface GrowthPmf {
  /** Share of new users who reach first value (the "aha"). 0–1 or already-%. */
  activationRate: number | null;
  /** Day-cohort return curve — a flattening curve is the strongest PMF signal. */
  retentionD1: number | null;
  retentionD7: number | null;
  retentionD30: number | null;
  /** Weekly-cohort returns — the headline for weekly-cadence products. */
  retentionW1: number | null;
  retentionW4: number | null;
  /** True once the weekly curve levels off on a committed cohort (the PMF signal). */
  retentionCurveFlattening: boolean | null;
  /** Non-paid / referral share of signups — is it spreading on its own? */
  organicShareRate: number | null;
  /** none | weak | emerging | strong; null or "none" → no signal yet. */
  signal: GrowthSignal | null;
}

/**
 * A GTM data source the growth agent pulls from (waitlist / analytics / billing /
 * email …). `connected` means it's wired and reporting; otherwise the agent
 * can't validate that part of the funnel and an owner action (gtm-connect-* /
 * connect-channels) is the unblock. REAL status only — never assumed connected.
 */
export interface GrowthSource {
  name: string;
  /** Raw status from the feed, e.g. "connected" | "awaiting_connect". */
  status: string;
  connected: boolean;
}

/**
 * Strategic 1:1 outreach — curated email DRAFTS the growth agent prepares for the
 * OWNER to review and send. DRAFT-ONLY: the agent never sends. The draft bodies
 * live in the owner's Gmail (never the repo), so we surface only the funnel
 * counts. Replies are owner-reported, never fabricated; 0/null pre-launch.
 */
export interface GrowthOutreach {
  /** Curated drafts the agent queued for the owner in the last 7d. */
  drafted7d: number | null;
  /** Of those, how many the owner actually sent (owner-reported). */
  ownerSent7d: number | null;
  /** Replies received (owner-reported, never fabricated). */
  replies7d: number | null;
  signal: GrowthSignal | null;
}

export interface GrowthLinks {
  inAppAnalytics: string | null;
  ownerDoc: string | null;
}

// ── Quant-only (LLM-Quant): weekly PnL tracking + the real-money GO signal ──

/** Weekly PnL / trading metrics. Pre-edge most are null/0 — never fabricated. */
export interface GrowthMetrics {
  weeklyPnlPaper: number | null;
  weeklyPnlLive: number | null;
  /** The go-live profit floor (e.g. $2,000/wk). */
  weeklyPnlTargetUsd: number | null;
  weeksValidatedAboveFloor: number | null;
  hitRate: number | null;
  brierCalibration: number | null;
  sharpe: number | null;
  maxDrawdownPct: number | null;
  totalTrades: number | null;
}

export type GoLiveStatus = "not_ready" | "eligible";
export type GoLiveConfidence = "none" | "building" | "high";

export interface GoLiveCriterion {
  /** Raw snake_case key from the file (humanized for display). */
  key: string;
  met: boolean;
}

/**
 * The real-money GO signal. `eligible` is gated in the repo's preflight CI
 * (every criterion true + profit floor met + all DoD boxes) so it can't be
 * faked. Even at `eligible`, flipping to real money stays the owner's call.
 */
export interface GrowthGoLive {
  status: GoLiveStatus | null;
  confidence: GoLiveConfidence | null;
  /** The readiness checklist (10 booleans), in published order. */
  criteria: GoLiveCriterion[];
  /** What's currently stopping GO. */
  blocking: string[];
  ownerDecisionRequired: boolean | null;
}

/** The parsed growth status for one project. Availability-gated like the rest. */
export interface Growth extends Availability {
  /** GitHub blob URL for the source file (for the "see file" link). */
  sourceUrl?: string;
  project?: string;
  /** YYYY-MM-DD the agent last stamped. Drives the staleness flag. */
  asOf?: string;
  phase?: GrowthPhase;
  engineBuilt?: boolean;
  awaitingConnect?: boolean;
  channelsConnected: string[];
  /** GTM data sources (waitlist/analytics/billing/email) + connected status. */
  sources: GrowthSource[];
  funnel: GrowthFunnel;
  acquisition: GrowthAcquisition;
  channels: GrowthChannel[];
  experiments: GrowthExperiment[];
  email: GrowthEmail;
  content: GrowthContent;
  learnings: string[];
  nextActions: string[];
  ownerBlockers: string[];
  links: GrowthLinks;
  /** Product-market fit signals — the leading indicator. Absent until a repo adds it. */
  pmf?: GrowthPmf;
  /** Strategic outreach drafts funnel. Absent for products without a growth agent (e.g. LLM-Quant). */
  outreach?: GrowthOutreach;
  /** Quant-only: weekly PnL / trading metrics. Absent for non-quant projects. */
  metrics?: GrowthMetrics;
  /** Quant-only: the real-money GO signal. Absent for non-quant projects. */
  goLive?: GrowthGoLive;
}

// ────────────────────────────────────────────────────────────────────────────
// Minimal YAML-subset parser (indentation-aware; maps, block sequences of
// scalars OR maps, inline [..]/{..} flows, typed scalars, # comments).
// ────────────────────────────────────────────────────────────────────────────

type Yaml = string | number | boolean | null | Yaml[] | { [k: string]: Yaml };

interface Ln {
  indent: number;
  text: string;
}

/** Strip a `#` comment that sits outside quotes (and not mid-token, e.g. a URL). */
function stripComment(s: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "#" && !inSingle && !inDouble && (i === 0 || /\s/.test(s[i - 1]))) {
      return s.slice(0, i);
    }
  }
  return s;
}

function toLines(src: string): Ln[] {
  const out: Ln[] = [];
  for (const raw of src.replace(/\r\n/g, "\n").split("\n")) {
    const nc = stripComment(raw);
    if (!nc.trim()) continue;
    out.push({ indent: nc.length - nc.trimStart().length, text: nc.trim() });
  }
  return out;
}

function parseScalar(raw: string): Yaml {
  const t = raw.trim();
  if (t === "") return null;
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1); // explicitly quoted → string, no coercion
  }
  if (/^(null|~)$/i.test(t)) return null;
  if (/^(true|yes)$/i.test(t)) return true;
  if (/^(false|no)$/i.test(t)) return false;
  if (/^-?\d+$/.test(t)) {
    const n = Number(t);
    return Number.isSafeInteger(n) ? n : t;
  }
  if (/^-?(?:\d+\.\d*|\.\d+|\d+)$/.test(t) && /\./.test(t)) return Number(t);
  return t; // dates, slugs, paths, prose
}

/** Split a flow collection's inner text on top-level commas (respects quotes/brackets). */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let cur = "";
  for (const c of s) {
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    if (!inSingle && !inDouble) {
      if (c === "[" || c === "{") depth++;
      else if (c === "]" || c === "}") depth--;
      else if (c === "," && depth === 0) {
        out.push(cur);
        cur = "";
        continue;
      }
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseFlow(s: string): Yaml {
  const t = s.trim();
  if (t.startsWith("[")) {
    const inner = t.slice(1, t.lastIndexOf("]"));
    return inner.trim() ? splitTop(inner).map(parseFlow) : [];
  }
  if (t.startsWith("{")) {
    const inner = t.slice(1, t.lastIndexOf("}"));
    const map: Record<string, Yaml> = {};
    for (const pair of splitTop(inner)) {
      const m = pair.match(/^\s*([A-Za-z0-9_][A-Za-z0-9_./-]*)\s*:\s*([\s\S]*)$/);
      if (m) map[m[1]] = parseFlow(m[2]);
    }
    return map;
  }
  return parseScalar(t);
}

// Keys are snake_case by convention, but map keys can be real-world identifiers
// with dots/hyphens/slashes — model names ("gemini-2.5-pro", "claude-opus-4-8"),
// stage names ("self-review"). Allow those after an alnum/underscore first char
// (so a "- " sequence marker can never be read as a key). Without the dot/hyphen
// a `by_model:` map keyed by model name would silently parse to `{}`.
const KEY_RE = /^([A-Za-z0-9_][A-Za-z0-9_./-]*)\s*:\s*([\s\S]*)$/;
const isSeqLine = (t: string) => t === "-" || t.startsWith("- ");
/** A YAML block-scalar header: `|` or `>`, with optional chomping/indent ("|-", ">-", "|2"). */
const BLOCK_SCALAR_RE = /^[|>]([+-]|\d)*$/;

/**
 * Read a block scalar's body — the lines indented deeper than its key — and fold
 * them into one space-joined string. (toLines already drops blank lines and
 * leading indentation, so literal `|` and folded `>` both collapse to clean
 * prose, which is what our single-string display fields want.) Without this, a
 * `gap: >-` / `how: |` value would be parsed as the literal indicator (">-", "|")
 * and that indicator would leak into the UI. Returns [text, nextLineIndex].
 */
function readBlockScalar(lines: Ln[], start: number, parentIndent: number): [string, number] {
  let i = start;
  const parts: string[] = [];
  while (i < lines.length && lines[i].indent > parentIndent) {
    parts.push(lines[i].text);
    i++;
  }
  return [parts.join(" ").trim(), i];
}

/**
 * Fold an implicit multi-line plain/quoted scalar: a non-empty value whose text
 * wraps onto more-indented continuation lines (no `|`/`>` indicator). A scalar
 * can't have child nodes, so any more-indented non-sequence lines that follow
 * MUST be continuation — join them with a space. Without this, a wrapped list
 * item or value truncates at its first line AND unwinds the parse, silently
 * dropping every sibling key after it. Returns [folded, nextLineIndex].
 */
function foldContinuations(
  lines: Ln[],
  start: number,
  parentIndent: number,
  seed: string,
): [string, number] {
  let raw = seed;
  let i = start;
  while (i < lines.length && lines[i].indent > parentIndent && !isSeqLine(lines[i].text)) {
    raw += " " + lines[i].text;
    i++;
  }
  return [raw, i];
}

/** Parse a mapping or sequence at `indent`, returning [value, nextLineIndex]. */
function parseNode(lines: Ln[], start: number, indent: number): [Yaml, number] {
  let i = start;
  if (i >= lines.length) return [null, i];

  if (isSeqLine(lines[i].text)) {
    const arr: Yaml[] = [];
    while (i < lines.length && lines[i].indent === indent && isSeqLine(lines[i].text)) {
      const line = lines[i];
      const rest = line.text === "-" ? "" : line.text.slice(2).trim();
      if (rest === "") {
        const childIndent = i + 1 < lines.length ? lines[i + 1].indent : indent + 1;
        if (childIndent > indent) {
          const [v, ni] = parseNode(lines, i + 1, childIndent);
          arr.push(v);
          i = ni;
        } else {
          arr.push(null);
          i++;
        }
      } else if (KEY_RE.test(rest) && !rest.startsWith("{") && !rest.startsWith("[")) {
        // "- key: value" → a map item: inline first key + following deeper lines.
        const itemIndent = line.indent + 2;
        const sub: Ln[] = [{ indent: itemIndent, text: rest }];
        let j = i + 1;
        while (j < lines.length && lines[j].indent > line.indent) {
          sub.push(lines[j]);
          j++;
        }
        const [v] = parseNode(sub, 0, itemIndent);
        arr.push(v);
        i = j;
      } else if (rest.startsWith("[") || rest.startsWith("{")) {
        arr.push(parseFlow(rest));
        i++;
      } else {
        // Plain/quoted scalar item — may wrap onto more-indented lines.
        const [raw, ni] = foldContinuations(lines, i + 1, line.indent, rest);
        arr.push(parseScalar(raw));
        i = ni;
      }
    }
    return [arr, i];
  }

  const map: Record<string, Yaml> = {};
  while (i < lines.length && lines[i].indent === indent && !isSeqLine(lines[i].text)) {
    const m = lines[i].text.match(KEY_RE);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const val = m[2].trim();
    if (val === "") {
      const childIndent = i + 1 < lines.length ? lines[i + 1].indent : indent;
      if (i + 1 < lines.length && childIndent > indent) {
        const [v, ni] = parseNode(lines, i + 1, childIndent);
        map[key] = v;
        i = ni;
      } else {
        map[key] = null;
        i++;
      }
    } else if (BLOCK_SCALAR_RE.test(val)) {
      const [text, ni] = readBlockScalar(lines, i + 1, indent);
      map[key] = text;
      i = ni;
    } else if (val.startsWith("[") || val.startsWith("{")) {
      map[key] = parseFlow(val);
      i++;
    } else {
      // Plain/quoted scalar value — may wrap onto more-indented lines.
      const [raw, ni] = foldContinuations(lines, i + 1, indent, val);
      map[key] = parseScalar(raw);
      i = ni;
    }
  }
  return [map, i];
}

function parseYaml(src: string): Yaml {
  const lines = toLines(src);
  if (lines.length === 0) return null;
  return parseNode(lines, 0, lines[0].indent)[0];
}

/** First fenced code block whose body matches `keyRe`. */
function findFencedBlock(md: string, keyRe: RegExp): string | null {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let open = false;
  let body: string[] = [];
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (!open) {
        open = true;
        body = [];
      } else {
        const text = body.join("\n");
        if (keyRe.test(text)) return text;
        open = false;
      }
      continue;
    }
    if (open) body.push(line);
  }
  return null;
}

/**
 * Find a fenced YAML block keyed by `topKey` and return its root object (the map
 * under that key), or null. Shared with the OWNER_ACTIONS parser in parsers.ts
 * so the whole repo has ONE YAML-subset parser.
 */
export function parseYamlBlock(
  md: string | null | undefined,
  topKey: string,
): Record<string, unknown> | null {
  if (!md || !md.trim()) return null;
  const block = findFencedBlock(md, new RegExp(`(^|\\n)\\s*${topKey}\\s*:`));
  if (!block) return null;
  let parsed: Yaml;
  try {
    parsed = parseYaml(block);
  } catch {
    return null;
  }
  const top = asObj(parsed);
  const root = asObj(topKey in top ? top[topKey] : parsed);
  return Object.keys(root).length ? (root as Record<string, unknown>) : null;
}

/**
 * Parse a raw (un-fenced) YAML document — e.g. a standalone `*.yml` manifest —
 * with the same subset parser. Returns the root value, or null on empty/garbled.
 */
export function parseYamlDocument(src: string | null | undefined): unknown {
  if (!src || !src.trim()) return null;
  try {
    return parseYaml(src);
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Typed extraction from the parsed (snake_case) object
// ────────────────────────────────────────────────────────────────────────────

function asObj(v: Yaml | undefined): Record<string, Yaml> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Yaml>) : {};
}
function num(v: Yaml | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: Yaml | undefined): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function bool(v: Yaml | undefined): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function strArr(v: Yaml | undefined): string[] {
  return Array.isArray(v)
    ? v.map((x) => (typeof x === "string" ? x.trim() : null)).filter((x): x is string => !!x)
    : [];
}
function objArr(v: Yaml | undefined): Record<string, Yaml>[] {
  return Array.isArray(v)
    ? v.filter((x): x is Record<string, Yaml> => !!x && typeof x === "object" && !Array.isArray(x))
    : [];
}

const PHASES: GrowthPhase[] = ["pre_launch", "launching", "post_launch"];

function blankGrowth(): Omit<Growth, "available"> {
  return {
    channelsConnected: [],
    sources: [],
    funnel: {
      visitors7d: null,
      waitlistSignupsTotal: null,
      waitlistSignups7d: null,
      visitorToWaitlistRate: null,
      trialStartsTotal: null,
      paidConversionsTotal: null,
      trialToPaidRate: null,
      activeSubscribers: null,
      mrrUsd: null,
      churnRate30d: null,
    },
    acquisition: { cacUsd: null, ltvUsd: null, ltvCacRatio: null, topChannel: null },
    channels: [],
    experiments: [],
    email: {
      listSize: null,
      doubleOptIn: null,
      lastStageSent: null,
      openRate: null,
      clickRate: null,
    },
    content: { published7d: null, scheduledNext7d: null, organicSessions7d: null },
    learnings: [],
    nextActions: [],
    ownerBlockers: [],
    links: { inAppAnalytics: null, ownerDoc: null },
  };
}

const GO_STATUSES: GoLiveStatus[] = ["not_ready", "eligible"];
const GO_CONFIDENCES: GoLiveConfidence[] = ["none", "building", "high"];

/** True only for a present mapping node (not a scalar, null, or sequence). */
function isObj(v: Yaml | undefined): boolean {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Quant-only weekly PnL / trading metrics. Every field null when absent. */
function parseMetrics(m: Record<string, Yaml>): GrowthMetrics {
  return {
    weeklyPnlPaper: num(m.weekly_pnl_paper),
    weeklyPnlLive: num(m.weekly_pnl_live),
    weeklyPnlTargetUsd: num(m.weekly_pnl_target_usd),
    weeksValidatedAboveFloor: num(m.weeks_validated_above_floor),
    hitRate: num(m.hit_rate),
    brierCalibration: num(m.brier_calibration),
    sharpe: num(m.sharpe),
    maxDrawdownPct: num(m.max_drawdown_pct),
    totalTrades: num(m.total_trades),
  };
}

/**
 * The real-money GO signal. Status/confidence are validated against the known
 * enums (anything else → null). Criteria preserve the file's published order;
 * each is met only when its value is literally `true` (default-deny). We never
 * synthesize a verdict — `eligible` is gated in the repo's own preflight CI.
 */
function parseGoLive(g: Record<string, Yaml>): GrowthGoLive {
  const statusStr = str(g.status);
  const confStr = str(g.confidence);
  const crit = asObj(g.criteria);
  return {
    status: GO_STATUSES.includes(statusStr as GoLiveStatus) ? (statusStr as GoLiveStatus) : null,
    confidence: GO_CONFIDENCES.includes(confStr as GoLiveConfidence)
      ? (confStr as GoLiveConfidence)
      : null,
    criteria: Object.keys(crit).map((key) => ({ key, met: bool(crit[key]) === true })),
    blocking: strArr(g.blocking),
    ownerDecisionRequired: bool(g.owner_decision_required),
  };
}

const GROWTH_SIGNALS: GrowthSignal[] = ["none", "weak", "emerging", "strong"];

/** Validate the signal enum; anything unknown (incl. absent) → null = "no signal yet". */
function parseSignal(v: Yaml | undefined): GrowthSignal | null {
  const s = str(v);
  return s && GROWTH_SIGNALS.includes(s as GrowthSignal) ? (s as GrowthSignal) : null;
}

/** PMF leading-indicator block. Every field stays null until a real source reports. */
function parsePmf(p: Record<string, Yaml>): GrowthPmf {
  return {
    activationRate: num(p.activation_rate),
    retentionD1: num(p.retention_d1),
    retentionD7: num(p.retention_d7),
    retentionD30: num(p.retention_d30),
    retentionW1: num(p.retention_w1),
    retentionW4: num(p.retention_w4),
    retentionCurveFlattening: bool(p.retention_curve_flattening),
    organicShareRate: num(p.organic_share_rate),
    signal: parseSignal(p.signal),
  };
}

/** GTM data sources map (name → status) → typed list. connected == "connected". */
function parseSources(s: Record<string, Yaml>): GrowthSource[] {
  return Object.keys(s).map((name) => {
    const status = str(s[name]) ?? "";
    return { name, status, connected: /^connected$/i.test(status) };
  });
}

/** Strategic outreach drafts funnel — owner-reported, never fabricated. */
function parseOutreach(o: Record<string, Yaml>): GrowthOutreach {
  return {
    drafted7d: num(o.drafted_7d),
    ownerSent7d: num(o.owner_sent_7d),
    replies7d: num(o.replies_7d),
    signal: parseSignal(o.signal),
  };
}

/**
 * Parse docs/growth/GROWTH_STATUS.md into a Growth. Returns `available: false`
 * (with a reason + the file link) when the block is missing or unparseable —
 * never a fabricated value. Missing keys degrade to null/[] tolerantly.
 */
export function parseGrowth(
  md: string | null | undefined,
  fileUrl?: string,
): Growth {
  const unavailable = (reason: string): Growth => ({
    ...blankGrowth(),
    available: false,
    reason,
    sourceUrl: fileUrl,
  });

  if (!md || !md.trim()) return unavailable("GROWTH_STATUS.md not found");
  const block = findFencedBlock(md, /(^|\n)\s*GROWTH_STATUS\s*:/);
  if (!block) return unavailable("no GROWTH_STATUS block — see file");

  let parsed: Yaml;
  try {
    parsed = parseYaml(block);
  } catch {
    return unavailable("GROWTH_STATUS block unparseable — see file");
  }

  const top = asObj(parsed);
  const root = asObj("GROWTH_STATUS" in top ? top.GROWTH_STATUS : parsed);
  if (Object.keys(root).length === 0) {
    return unavailable("GROWTH_STATUS block empty — see file");
  }

  const f = asObj(root.funnel);
  const a = asObj(root.acquisition);
  const em = asObj(root.email);
  const co = asObj(root.content);
  const li = asObj(root.links);
  const phaseStr = str(root.phase);

  return {
    available: true,
    sourceUrl: fileUrl,
    project: str(root.project) ?? undefined,
    asOf: str(root.as_of) ?? undefined,
    phase: PHASES.includes(phaseStr as GrowthPhase) ? (phaseStr as GrowthPhase) : undefined,
    engineBuilt: bool(root.engine_built) ?? undefined,
    awaitingConnect: bool(root.awaiting_connect) ?? undefined,
    channelsConnected: strArr(root.channels_connected),
    sources: parseSources(asObj(root.sources)),
    funnel: {
      visitors7d: num(f.visitors_7d),
      waitlistSignupsTotal: num(f.waitlist_signups_total),
      waitlistSignups7d: num(f.waitlist_signups_7d),
      visitorToWaitlistRate: num(f.visitor_to_waitlist_rate),
      trialStartsTotal: num(f.trial_starts_total),
      paidConversionsTotal: num(f.paid_conversions_total),
      trialToPaidRate: num(f.trial_to_paid_rate),
      activeSubscribers: num(f.active_subscribers),
      mrrUsd: num(f.mrr_usd),
      churnRate30d: num(f.churn_rate_30d),
    },
    acquisition: {
      cacUsd: num(a.cac_usd),
      ltvUsd: num(a.ltv_usd),
      ltvCacRatio: num(a.ltv_cac_ratio),
      topChannel: str(a.top_channel),
    },
    channels: objArr(root.channels).map((c) => ({
      name: str(c.name) ?? "",
      status: str(c.status) ?? "",
      reach7d: num(c.reach_7d),
      clicks7d: num(c.clicks_7d),
      signups7d: num(c.signups_7d),
      ctr: num(c.ctr),
      notes: str(c.notes) ?? "",
    })),
    experiments: objArr(root.experiments).map((e) => ({
      id: str(e.id) ?? "",
      hypothesis: str(e.hypothesis) ?? "",
      status: str(e.status) ?? "",
      result: str(e.result) ?? "",
      liftPct: num(e.lift_pct),
      started: str(e.started) ?? "",
      decided: str(e.decided) ?? "",
    })),
    email: {
      listSize: num(em.list_size),
      doubleOptIn: bool(em.double_opt_in),
      lastStageSent: str(em.last_stage_sent),
      openRate: num(em.open_rate),
      clickRate: num(em.click_rate),
    },
    content: {
      published7d: num(co.published_7d),
      scheduledNext7d: num(co.scheduled_next_7d),
      organicSessions7d: num(co.organic_sessions_7d),
    },
    learnings: strArr(root.learnings),
    nextActions: strArr(root.next_actions),
    ownerBlockers: strArr(root.owner_blockers),
    links: {
      inAppAnalytics: str(li.in_app_analytics),
      ownerDoc: str(li.owner_doc),
    },
    // Sub-blocks attached only when the repo actually publishes them, so the UI
    // can key off existence and products that haven't added a block stay clean.
    ...(isObj(root.pmf) ? { pmf: parsePmf(asObj(root.pmf)) } : {}),
    ...(isObj(root.outreach) ? { outreach: parseOutreach(asObj(root.outreach)) } : {}),
    // Quant-only blocks (LLM-Quant has no growth agent → no pmf/outreach either).
    ...(isObj(root.metrics) ? { metrics: parseMetrics(asObj(root.metrics)) } : {}),
    ...(isObj(root.go_live) ? { goLive: parseGoLive(asObj(root.go_live)) } : {}),
  };
}

/** True when the growth block's `as_of` is older than `days` (agent may be stuck). */
export function growthStale(g: Growth, days = 3): boolean {
  if (!g.available || !g.asOf) return false;
  const t = Date.parse(g.asOf);
  if (Number.isNaN(t)) return false;
  return Date.now() - t > days * 24 * 60 * 60 * 1000;
}

/** The most recent experiment that has a decided result (for the headline). */
export function latestDecidedExperiment(g: Growth): GrowthExperiment | null {
  const decided = g.experiments.filter((e) => e.decided || /decided|done|complete|shipped/i.test(e.status));
  if (decided.length === 0) return null;
  return decided.reduce((best, e) => (e.decided > (best.decided || "") ? e : best), decided[0]);
}

/**
 * PMF signal worth surfacing on the dense Floor tile — only once it's advanced
 * past the early/none states, so pre-launch tiles stay calm and uncluttered.
 */
export function floorPmfSignal(g: Growth): GrowthSignal | null {
  const s = g.pmf?.signal;
  return s === "emerging" || s === "strong" ? s : null;
}
