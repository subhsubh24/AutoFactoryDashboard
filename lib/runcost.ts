/**
 * docs/autonomous-loop/COST_LEDGER.jsonl → RunCost.
 *
 * Each routine self-reports its OWN run token usage (FACTORY_STANDARD §33): one
 * append-only JSONL line per run with per-model token counts summed from its
 * session transcript. We convert tokens → USD here via the single price table
 * (config/model-prices.ts), so the ledger stays pure facts and pricing lives in
 * one place. No OTEL collector, no admin key — just a git file, the same pattern
 * as VALIDATOR_STATUS / GROWTH_STATUS.
 *
 * This is an ESTIMATE (self-reported tokens × list price), clearly labelled as
 * such — never billing-grade, but real per-routine, per-model visibility. A
 * missing/garbled ledger degrades to `available: false`, never a guessed number.
 */

import type { Availability } from "@/lib/types";
import { usdFor, isUnknownModel, PRICES_AS_OF, type TokenCounts } from "@/config/model-prices";

/** One USD line (a model or a routine role). */
export interface CostLine {
  label: string;
  usd: number;
}

export interface RunCost extends Availability {
  sourceUrl?: string;
  /** Prices-as-of date (so the UI can note pricing freshness). */
  pricesAsOf: string;
  /** Window the headline covers, in days. */
  windowDays: number;
  /** Total estimated USD over the window. */
  windowUsd: number;
  /** Total estimated USD all-time in the ledger. */
  totalUsd: number;
  /** Number of runs (ledger lines) in the window. */
  runsInWindow: number;
  /** Window spend split by model, highest first. */
  byModel: CostLine[];
  /** Window spend split by routine role, highest first. */
  byRole: CostLine[];
  /** Daily USD over the window (oldest→newest) for a sparkline. */
  daily: number[];
  /** Total tokens (all types) over the window — powers avg tokens/run. */
  tokensInWindow: number;
  /** True if any run referenced a model with no known price (estimate is looser). */
  hasUnknownModel: boolean;
}

/** Sum every field of a TokenCounts bundle. */
export function sumTokens(t: TokenCounts): number {
  return t.input + t.output + t.cacheRead + t.cacheWrite;
}

interface LedgerRow {
  date: string;
  role: string;
  session: string;
  byModel: Record<string, TokenCounts>;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

/** Parse one JSONL line into a row, or null if malformed. */
function parseRow(line: string): LedgerRow | null {
  const s = line.trim();
  if (!s || s.startsWith("//") || s.startsWith("#")) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
  const date = typeof obj.date === "string" ? obj.date.slice(0, 10) : "";
  const role = typeof obj.role === "string" && obj.role.trim() ? obj.role.trim() : "unknown";
  const session = typeof obj.session === "string" ? obj.session : "";
  const bm = obj.by_model;
  if (!date || !bm || typeof bm !== "object" || Array.isArray(bm)) return null;
  const byModel: Record<string, TokenCounts> = {};
  for (const [model, raw] of Object.entries(bm as Record<string, unknown>)) {
    const t = (raw ?? {}) as Record<string, unknown>;
    byModel[model] = {
      input: num(t.input),
      output: num(t.output),
      cacheRead: num(t.cache_read),
      cacheWrite: num(t.cache_write),
    };
  }
  return { date, role, session, byModel };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parse the JSONL ledger. `now` is injectable for deterministic tests; defaults
 * to the current time. Dedupes by session id (idempotent self-reports).
 */
export function parseRunCost(
  jsonl: string | null | undefined,
  fileUrl?: string,
  windowDays = 30,
  now: number = Date.now(),
): RunCost {
  const blank: RunCost = {
    available: false,
    sourceUrl: fileUrl,
    pricesAsOf: PRICES_AS_OF,
    windowDays,
    windowUsd: 0,
    totalUsd: 0,
    runsInWindow: 0,
    byModel: [],
    byRole: [],
    daily: [],
    tokensInWindow: 0,
    hasUnknownModel: false,
  };
  if (!jsonl || !jsonl.trim()) {
    return { ...blank, reason: "no cost ledger yet — routines report it in bookkeeping (§33)" };
  }

  // Dedupe by session (last write wins); keep sessionless rows individually.
  const rows: LedgerRow[] = [];
  const bySession = new Map<string, number>();
  for (const line of jsonl.split("\n")) {
    const r = parseRow(line);
    if (!r) continue;
    if (r.session) {
      const idx = bySession.get(r.session);
      if (idx !== undefined) {
        rows[idx] = r;
        continue;
      }
      bySession.set(r.session, rows.length);
    }
    rows.push(r);
  }
  if (rows.length === 0) {
    return { ...blank, reason: "cost ledger present but no valid rows yet" };
  }

  const windowStart = now - windowDays * DAY_MS;
  const byModelUsd = new Map<string, number>();
  const byRoleUsd = new Map<string, number>();
  const byDayUsd = new Map<string, number>();
  let totalUsd = 0;
  let windowUsd = 0;
  let runsInWindow = 0;
  let tokensInWindow = 0;
  let hasUnknownModel = false;

  for (const r of rows) {
    const parsedDate = Date.parse(r.date);
    const inWindow = Number.isFinite(parsedDate) && parsedDate >= windowStart;
    let rowUsd = 0;
    let rowTokens = 0;
    for (const [model, t] of Object.entries(r.byModel)) {
      rowUsd += usdFor(model, t);
      rowTokens += sumTokens(t);
      if (isUnknownModel(model)) hasUnknownModel = true;
      if (inWindow) byModelUsd.set(model, (byModelUsd.get(model) ?? 0) + usdFor(model, t));
    }
    totalUsd += rowUsd;
    if (inWindow) {
      windowUsd += rowUsd;
      tokensInWindow += rowTokens;
      runsInWindow += 1;
      byRoleUsd.set(r.role, (byRoleUsd.get(r.role) ?? 0) + rowUsd);
      byDayUsd.set(r.date, (byDayUsd.get(r.date) ?? 0) + rowUsd);
    }
  }

  const toLines = (m: Map<string, number>): CostLine[] =>
    Array.from(m.entries())
      .map(([label, usd]) => ({ label, usd }))
      .filter((l) => l.usd > 0)
      .sort((a, b) => b.usd - a.usd);

  // Daily series across the whole window (fill gaps with 0), oldest→newest.
  const daily: number[] = [];
  const startDay = new Date(now - windowDays * DAY_MS);
  for (let i = 0; i <= windowDays; i++) {
    const d = new Date(startDay.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    daily.push(byDayUsd.get(d) ?? 0);
  }

  if (windowUsd === 0 && totalUsd === 0) {
    return { ...blank, reason: "cost ledger present, no spend recorded yet" };
  }

  return {
    available: true,
    sourceUrl: fileUrl,
    pricesAsOf: PRICES_AS_OF,
    windowDays,
    windowUsd,
    totalUsd,
    runsInWindow,
    byModel: toLines(byModelUsd),
    byRole: toLines(byRoleUsd),
    daily,
    tokensInWindow,
    hasUnknownModel,
  };
}
