/**
 * The single price table — tokens → USD.
 *
 * The routines self-report EXACT token counts by model into each repo's
 * docs/autonomous-loop/COST_LEDGER.jsonl (FACTORY_STANDARD §33). Tokens are
 * facts; dollars are derived HERE so pricing lives in exactly one place and the
 * ledger never carries a (drift-prone) dollar figure.
 *
 * Prices are USD per MILLION tokens, from Anthropic's published list pricing.
 * VERIFY against https://platform.claude.com/docs/en/about-claude/pricing and
 * bump here when it changes — nothing else needs to change.
 *
 * Cache: cache_read is billed ~0.1× the input rate; cache_creation (write) at
 * the 5-minute rate ~1.25× input. We price cache_write at the 5m rate (the
 * transcript reports a single aggregate cache_creation figure).
 */

export interface ModelPrice {
  /** $/MTok for uncached input. */
  input: number;
  /** $/MTok for output. */
  output: number;
  /** $/MTok for cache-read input (~0.1× input). */
  cacheRead: number;
  /** $/MTok for cache-creation input (5m rate, ~1.25× input). */
  cacheWrite: number;
}

/** Exact model-id overrides. */
const EXACT: Record<string, ModelPrice> = {
  "claude-opus-4-8": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-sonnet-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

/** Family fallbacks — a new point-version (e.g. claude-opus-4-9) still prices right. */
const FAMILY: { match: RegExp; price: ModelPrice }[] = [
  { match: /opus/i, price: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 } },
  { match: /sonnet/i, price: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } },
  { match: /haiku/i, price: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 } },
];

/** Last-resort price when a model id matches no family (keeps totals honest, flagged upstream). */
const UNKNOWN: ModelPrice = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

/** Look up the price for a model id (exact → family → unknown). */
export function priceFor(model: string): ModelPrice {
  if (EXACT[model]) return EXACT[model];
  const fam = FAMILY.find((f) => f.match.test(model));
  return fam ? fam.price : UNKNOWN;
}

/** True when the model id matched no known family (so the UI can flag the estimate). */
export function isUnknownModel(model: string): boolean {
  return !EXACT[model] && !FAMILY.some((f) => f.match.test(model));
}

/** Token counts as recorded in the ledger. */
export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** USD cost of a token bundle for a given model. */
export function usdFor(model: string, t: TokenCounts): number {
  const p = priceFor(model);
  return (
    (t.input * p.input +
      t.output * p.output +
      t.cacheRead * p.cacheRead +
      t.cacheWrite * p.cacheWrite) /
    1_000_000
  );
}

/** Date this table was last verified against the pricing page. */
export const PRICES_AS_OF = "2026-07-05";
