/**
 * docs/BUSINESS_CASE.md → Valuation.
 *
 * The autonomous loop maintains a bottoms-up business case with three scenarios
 * (conservative / base / optimistic) and explicit ARR numbers. This parser is
 * deliberately tolerant of tables, bullet lists, and headings.
 */

export interface Valuation {
  arrLow: number;
  arrExpected: number;
  arrHigh: number;
  rationale: string;
  /** Where the number came from. */
  source: "business_case" | "llm" | "template";
  /** Link to docs/BUSINESS_CASE.md (business_case only). */
  sourceUrl?: string;
  /** ISO date of the business case's last commit (business_case only). */
  asOf?: string;
}

function toNumber(numStr: string, suffix?: string): number {
  const n = parseFloat(numStr.replace(/,/g, ""));
  if (Number.isNaN(n)) return NaN;
  const mult = suffix && /m/i.test(suffix) ? 1_000_000 : suffix && /k/i.test(suffix) ? 1_000 : 1;
  return Math.round(n * mult);
}

/** First plausible money figure on a line (prefers $-prefixed, then k/M-suffixed). */
function extractMoney(line: string): number | null {
  const dollar = [...line.matchAll(/\$\s?([\d][\d,]*(?:\.\d+)?)\s*([kKmM])?/g)];
  if (dollar.length) {
    const n = toNumber(dollar[0][1], dollar[0][2]);
    if (!Number.isNaN(n)) return n;
  }
  const suff = [...line.matchAll(/\b([\d][\d,]*(?:\.\d+)?)\s*([kKmM])\b/g)];
  if (suff.length) {
    const n = toNumber(suff[0][1], suff[0][2]);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

/** Find an ARR figure near a scenario keyword (same line or the next few). */
function findScenarioArr(lines: string[], re: RegExp): number | null {
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue;
    for (let j = i; j < Math.min(i + 4, lines.length); j++) {
      const m = extractMoney(lines[j]);
      if (m !== null && m > 0) return m;
    }
  }
  return null;
}

function findHeadlineArr(lines: string[]): number | null {
  for (const line of lines) {
    if (/\b(arr|annual recurring|target|planning case|revenue|run[\s-]?rate)\b/i.test(line)) {
      const m = extractMoney(line);
      if (m !== null && m > 0) return m;
    }
  }
  for (const line of lines) {
    if (/\/\s*(yr|year|annum|annual)/i.test(line)) {
      const m = extractMoney(line);
      if (m !== null && m > 0) return m;
    }
  }
  return null;
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n).trim()}…` : s;
}

function cleanLine(s: string): string {
  return s
    .replace(/^[#>\s]*/, "")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/\|/g, " ")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findRationale(lines: string[]): string | null {
  // Prefer an explicit assumption/driver line; then a "planning/base case" line.
  const passes = [
    /\bassum\w*|\bdriver\b|conversion|churn|key assumption|key driver/i,
    /planning case|base[\s-]?case|bottoms?[\s-]?up/i,
  ];
  for (const re of passes) {
    const l = lines.find((x) => re.test(x) && cleanLine(x).length > 12);
    if (l) return clip(cleanLine(l), 180);
  }
  const prose = lines.find(
    (x) => cleanLine(x).length > 24 && /[a-z]/i.test(x) && !/^#{1,6}\s/.test(x),
  );
  return prose ? clip(cleanLine(prose), 180) : null;
}

const CONSERVATIVE = /conservativ|bear\b|pessimist|worst[\s-]?case|low[\s-]?case|downside|floor/i;
const BASE = /\bbase\b|expected|planning|realistic|\bmid\b|likely|central|baseline/i;
const OPTIMISTIC = /optimist|bull\b|best[\s-]?case|high[\s-]?case|upside|stretch|ceiling/i;

/**
 * Parse docs/BUSINESS_CASE.md into a Valuation. Returns null when no ARR figure
 * can be found (caller then falls back to the heuristic estimator).
 */
export function parseBusinessCase(
  content: string | null | undefined,
  sourceUrl: string,
  asOf?: string,
): Valuation | null {
  if (!content || !content.trim()) return null;
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  const base = findScenarioArr(lines, BASE);
  const cons = findScenarioArr(lines, CONSERVATIVE);
  const opt = findScenarioArr(lines, OPTIMISTIC);

  let arrExpected = base;
  if (arrExpected === null) {
    arrExpected = findHeadlineArr(lines);
    if (arrExpected === null) return null;
  }

  let arrLow = cons ?? Math.round(arrExpected * 0.3);
  let arrHigh = opt ?? Math.round(arrExpected * 3);
  // Keep ordering sane regardless of how the doc was written.
  arrLow = Math.min(arrLow, arrExpected);
  arrHigh = Math.max(arrHigh, arrExpected);

  return {
    arrLow,
    arrExpected,
    arrHigh,
    rationale: findRationale(lines) ?? "Bottoms-up business case.",
    source: "business_case",
    sourceUrl,
    asOf,
  };
}
