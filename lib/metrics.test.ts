/**
 * Evals for metric consistency — the "these two numbers should match" guarantee.
 * Run (aggregate.ts uses the `@/` path alias, so this needs tsx, not bare node):
 *   npx tsx --tsconfig ./tsconfig.json lib/metrics.test.ts
 *
 * The invariant these lock: every "7-day PRs" number on the dashboard counts the
 * SAME set of merged PRs. Concretely —
 *   • the work-mix donut total  = sum(bucketThemes(extractThemes(prs)))  = prs.length
 *   • "Shipping this week" total = sum(weeklyVelocity(feed) day counts)  = feed.length
 *     (for a feed whose PRs are all inside the current 7 UTC-calendar-day window)
 * so when both are fed the same window (they are — merged7dItems is that window),
 * the donut centre number and the WeekBars total are identical by construction.
 * This is the 872-vs-908 mismatch, locked shut.
 */
import { extractThemes, bucketThemes } from "./themes.ts";
import { weeklyVelocity } from "./aggregate.ts";
import type { PRItem, FeedEntry } from "./types.ts";

let failed = 0;
function expectEq(name: string, got: number, want: number) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name} — got ${got}, want ${want}`);
}

function pr(number: number, title: string, mergedAt: string): PRItem {
  return { number, title, url: `https://x/pull/${number}`, mergedAt };
}
function feedEntry(p: PRItem): FeedEntry {
  return { ...p, projectSlug: "p", projectName: "P", ci: "passing" };
}

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();
const H = 3_600_000;

// A spread of titles across every theme bucket + an unmatched one (→ fallback).
const TITLES = [
  "feat: add household sharing",
  "fix: crash on re-upload",
  "test: cover permission matrix",
  "chore: bump deps",
  "docs: update README",
  "refactor: extract parser",
  "perf: memoize tree",
  "security: rotate keys",
  "infra: add CI cache",
  "monetization: add paywall",
  "design: polish empty state",
  "auth: magic-link login",
  "mobile: fix safe-area inset",
  "store: prep app listing",
  "just some random change with no prefix",
];

console.log("── donut total == PR count (every PR classified into exactly one bucket) ──");
for (const n of [0, 1, 5, TITLES.length, 137]) {
  const prs = Array.from({ length: n }, (_, i) => pr(i, TITLES[i % TITLES.length], iso(-i * H)));
  const donutTotal = bucketThemes(extractThemes(prs)).reduce((s, b) => s + b.count, 0);
  expectEq(`n=${n}`, donutTotal, prs.length);
}

console.log("── WeekBars total == feed length (feed entirely inside the current week) ──");
for (const n of [0, 1, 6, 40]) {
  // Spread across the last ~6 days so multiple day-buckets are exercised.
  const feed = Array.from({ length: n }, (_, i) =>
    feedEntry(pr(i, TITLES[i % TITLES.length], iso(-((i % 6) * 24 * H + H)))),
  );
  const velTotal = weeklyVelocity(feed).reduce((s, d) => s + d.count, 0);
  expectEq(`n=${n}`, velTotal, feed.length);
}

console.log("── velocity counts ONLY in-window PRs (older ones excluded, not miscounted) ──");
{
  const inWindow = [pr(1, "feat: a", iso(-2 * H)), pr(2, "fix: b", iso(-3 * 24 * H))];
  const older = [pr(3, "feat: c", iso(-10 * 24 * H)), pr(4, "test: d", iso(-30 * 24 * H))];
  const feed = [...inWindow, ...older].map(feedEntry);
  const velTotal = weeklyVelocity(feed).reduce((s, d) => s + d.count, 0);
  expectEq("2 in-window of 4", velTotal, inWindow.length);
}

console.log("── the whole point: donut total === WeekBars total for the same in-window set ──");
{
  const prs = Array.from({ length: 55 }, (_, i) => pr(i, TITLES[i % TITLES.length], iso(-((i % 7) * 24 * H + H))));
  const donutTotal = bucketThemes(extractThemes(prs)).reduce((s, b) => s + b.count, 0);
  const velTotal = weeklyVelocity(prs.map(feedEntry)).reduce((s, d) => s + d.count, 0);
  expectEq("donut vs weekbars", donutTotal, velTotal);
}

// The subtle production bug the earlier evals CAN'T catch: merged7dItems is
// windowed when the snapshot is cached, then frozen; the donut later counts that
// frozen set while WeekBars re-windowed against a fresh render-time `now`. After
// a UTC-midnight rollover (warm cache) the two windows differ and the totals
// diverge. The fix: window ONCE at render and pass that same instant to
// weeklyVelocity. This locks that a shared instant keeps them equal AND excludes
// out-of-window PRs from BOTH surfaces identically.
console.log("── cache/render skew: donut + bars share ONE window instant (no midnight drift) ──");
{
  const nowMs = Date.parse("2026-03-10T00:20:00Z"); // just after a UTC midnight
  const d = new Date(nowMs);
  const weekStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 6);
  const at = (dayOffset: number) =>
    new Date(Date.UTC(2026, 2, 10 - dayOffset, 0, 0, 0)).toISOString();
  // offsets 0..6 are in the 7-day window; 7 and 8 fall just outside it.
  const all = [8, 7, 6, 5, 3, 1, 0].map((off) => pr(off, TITLES[off % TITLES.length], at(off)));
  const inWeekFeed = all.filter((p) => {
    const t = Date.parse(p.mergedAt ?? "");
    return !Number.isNaN(t) && t >= weekStart;
  });
  const donutTotal = bucketThemes(extractThemes(inWeekFeed)).reduce((s, b) => s + b.count, 0);
  const velTotal = weeklyVelocity(inWeekFeed.map(feedEntry), nowMs).reduce((s, x) => s + x.count, 0);
  expectEq("in-window set is the 7 recent days", inWeekFeed.length, 5); // offsets 6,5,3,1,0
  expectEq("donut(inWeek) == bars(inWeek, sameNow)", donutTotal, velTotal);
  expectEq("both == in-window count", velTotal, inWeekFeed.length);
}

console.log(failed === 0 ? "\nAll metric-consistency evals passed." : `\n${failed} FAILED`);
if (failed > 0) process.exit(1);
