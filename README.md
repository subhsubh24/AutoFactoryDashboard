# AutoFactoryDashboard

A single live view of an autonomous **product factory** — a set of GitHub repos
where a scheduled Claude agent ships PRs hourly toward an App-Store / web launch.

One place, per project and across all of them, to see:

- **Progress toward launch** — a % ring from each repo's `ROADMAP.md`.
- **What shipped** — merged PRs, newest first, across every repo.
- **CI health** — current status and recent pass rate per working branch.
- **⭐ What's waiting on _you_** — every blocker, queued op, and submission
  checklist, aggregated and prioritized into one checkable list.

It's a Next.js (App Router) app that reads the GitHub REST API server-side and
renders entirely from React Server Components. The GitHub token never reaches
the browser. Deploys to Vercel with zero extra infrastructure; optional history
and AI digests light up automatically when you configure them.

---

## Table of contents

- [How it works](#how-it-works)
- [Quick start (local)](#quick-start-local)
- [Environment variables](#environment-variables)
- [Create the GitHub token](#create-the-github-token)
- [Deploy to Vercel](#deploy-to-vercel)
- [The password gate (turn it on or off)](#the-password-gate-turn-it-on-or-off)
- [Optional: AI daily narrative](#optional-ai-daily-narrative)
- [Optional: history & trend charts (Vercel KV + cron)](#optional-history--trend-charts-vercel-kv--cron)
- [Add a project (one line)](#add-a-project-one-line)
- [The factory file conventions (the dashboard's "API")](#the-factory-file-conventions-the-dashboards-api)
- [Architecture](#architecture)
- [Resilience & security](#resilience--security)

---

## How it works

Two pages:

| Route        | What it shows |
| ------------ | ------------- |
| `/`          | **Factory Floor.** A one-line **factory headline** (PRs 24h · items needing you · CI · closest-to-launch), an overnight "what shipped" hero with a **since-yesterday delta** and loud loop-health flags, the prominent **Needs you** panel, manufacturing-style KPIs, weekly velocity, progress-to-launch, and a card per project — **ranked closest-to-launch first** — with a **liveness dot**, did/now/next digest, ARR (+ floor status), and its 24h delta. |
| `/p/[slug]`  | **Per project.** Readiness ring + next milestone; the ready **proof** (pre-flight + auditors) or, when not ready, a **Readiness gates** panel; per-track build bars; a 24-hour digest with a delta; ARR with floor status; a live "today" panel; **loop liveness + latest deep audit**; checkable action items; optional trends; and a sourced file list. |

Data is fetched server-side with [`@octokit/rest`](https://github.com/octokit/rest.js)
and cached with Next.js ISR (pages revalidate **hourly**; the LLM digest cache is
shorter), so pages are fresh without hammering the API. Every page shows a live
"updated _x_ ago" stamp, and **every number carries provenance** — a source badge,
an "as of" date, and a link to the underlying file or issue.

A single-password gate (middleware) keeps your private roadmaps and action items
off the public internet.

---

## Quick start (local)

Requirements: **Node 18.18+** (Node 20/22 recommended) and npm.

```bash
# 1. install
npm install

# 2. configure
cp .env.example .env.local
#   then edit .env.local and set at minimum:
#     GITHUB_TOKEN=github_pat_...      (see "Create the GitHub token")
#     DASHBOARD_PASSWORD=something-strong

# 3. run
npm run dev
#   → http://localhost:3000  (you'll be asked for DASHBOARD_PASSWORD)
```

Only `GITHUB_TOKEN` + `DASHBOARD_PASSWORD` are needed to run the full MVP.
Everything else is optional and degrades gracefully when absent.

```bash
npm run build   # production build (what Vercel runs)
npm run start   # serve the production build
npm run lint    # eslint
```

---

## Environment variables

| Variable | Required | Purpose |
| -------- | :------: | ------- |
| `GITHUB_TOKEN` | ✅ | Fine-grained PAT, **read-only**, for the factory repos. Server-side only. |
| `DASHBOARD_PASSWORD` | ✅¹ | Single shared password for the auth gate. |
| `OPENROUTER_API_KEY` | — | Enables AI daily digests via OpenRouter (OpenAI-compatible; free tier). Without it, digests are templated. |
| `OPENROUTER_MODEL` | — | Override the digest model (default `meta-llama/llama-3.3-70b-instruct:free`). |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | — | Vercel KV — enables daily history + trend sparklines. Auto-injected by Vercel. |
| `CRON_SECRET` | — | If set, the daily snapshot route requires it (Vercel sends it automatically). |

¹ If `DASHBOARD_PASSWORD` is unset, the gate is **disabled** and the dashboard is
public. Always set it for any shared/hosted deployment.

All variables are documented in [`.env.example`](./.env.example).

---

## Create the GitHub token

The dashboard only ever **reads**. Use a **fine-grained** PAT scoped to just your
factory repos.

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** →
   **Fine-grained tokens** → **Generate new token**.
   (Direct link: <https://github.com/settings/tokens?type=beta>)
2. **Token name**: `autofactory-dashboard` · **Expiration**: your choice.
3. **Resource owner**: the account/org that owns the factory repos.
4. **Repository access** → **Only select repositories** → pick your factory repos
   (e.g. `AptDesignerAI`, `HighlightMagic`, `GroceryManager`).
5. **Repository permissions** → set each of these to **Read-only**:
   - **Contents** (read `ROADMAP.md`, `PENDING_OPS.md`, etc.)
   - **Pull requests** (merged/open PRs)
   - **Issues** (the "ready for submission" issue, attention issues)
   - **Actions** (CI run status)
   - **Metadata** (required; auto-selected)
6. **Generate token** and copy the `github_pat_…` value into `GITHUB_TOKEN`.

> No other permissions are needed. If a repo is public, the token still works and
> simply has read access; the dashboard treats public/private repos identically.

---

## Deploy to Vercel

1. Push this repo to GitHub (already done if you're reading this there).
2. In Vercel: **Add New… → Project → Import** this repository.
   The framework preset auto-detects **Next.js** — no build settings to change.
3. **Settings → Environment Variables** — add at minimum:
   - `GITHUB_TOKEN`
   - `DASHBOARD_PASSWORD`
   - *(optional)* `OPENROUTER_API_KEY`, `CRON_SECRET`
4. **Deploy.** That's it — the MVP is live and gated.

The daily cron in [`vercel.json`](./vercel.json) is registered automatically on
deploy (it's a no-op until you add KV — see below).

---

## The password gate (turn it on or off)

The dashboard is gated by a single shared password (`DASHBOARD_PASSWORD`). The
gate is **enforced when that variable is set** and **disabled when it's unset** —
no code change either way.

**Turn it off (make the dashboard public):**

1. Vercel → your project → **Settings → Environment Variables**.
2. Remove **`DASHBOARD_PASSWORD`** (row's **⋯ → Remove**, for every environment).
3. **Deployments → latest → ⋯ → Redeploy** — env-var changes only take effect on
   a new deploy.

The login prompt and the "Sign out" button disappear automatically.

**Turn it on (or change it):** add `DASHBOARD_PASSWORD` back (any strong string)
and redeploy. The password is hashed (SHA-256) into an httpOnly cookie — the
browser never sees the plaintext, and the value never reaches client JS.

---

## Optional: AI summaries (Gemini or OpenRouter)

An LLM powers the **factory briefing**, per-project **did/now/next digests +
headlines**, and the completed-project **"what was built"** summary. Provider
preference: **Gemini first, then OpenRouter**, then deterministic templates.

- **Gemini (recommended — reliable free tier):** set `GEMINI_API_KEY`. Get one
  at <https://aistudio.google.com/apikey> (no card). Default model
  `gemini-2.5-flash-lite` — fast, cheap, and non-"thinking", so it returns the
  digest within a small token budget (a reasoning model can spend the whole
  output budget thinking and come back empty with `MAX_TOKENS`); override with
  `GEMINI_MODEL`. A 404 on a pinned model self-heals by retrying the default.
- **Health check:** `GET /api/llm-health` (auth-gated) runs the exact LLM path
  the digests use and returns `{ ok, provider, model, reason, … }` — the fastest
  way to confirm the key works in your deployment (never returns the key itself).
- **OpenRouter (fallback):** set `OPENROUTER_API_KEY` (<https://openrouter.ai/keys>).
  Default `meta-llama/llama-3.3-70b-instruct:free`; override with
  `OPENROUTER_MODEL`. Free slugs rotate and **rate-limit aggressively**, which is
  why Gemini is preferred. If both keys are set, Gemini is tried first and
  OpenRouter is the automatic fallback.
- Every call has a short timeout and **never blocks the page** — any failure (no
  key, bad/decommissioned model, rate limit, timeout) silently falls back to the
  templated summary. Cards show an **AI digest** vs **Summary** chip so you always
  know which you're seeing. If you see **Summary** everywhere, the key isn't set
  in your deploy's environment (or the model is rate-limited).

---

## Optional: history & trend charts (Vercel KV + cron)

Trend sparklines (PRs/day, %-to-submission, CI pass%) are powered by a daily
snapshot written to a **Vercel KV / Upstash Redis** store. Entirely optional —
without it, the charts are hidden and the cron route is a silent no-op.

**1 — Create & connect the store**

1. Vercel → your project → **Storage → Create Database**.
2. Choose **Redis** (listed as *Upstash for Redis* / "KV"). Name it
   `afd-history`, pick a nearby region, create it.
3. **Connect to Project** → select this project and all environments. Vercel
   injects the REST credentials automatically — no copy/paste. The app accepts
   either `KV_REST_API_URL` / `KV_REST_API_TOKEN` **or** the
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` names, so whichever the
   integration sets will work.
4. **Redeploy** so the new vars take effect.

**2 — Seed the first data point**

Visit the snapshot route once in your browser:

```
https://<your-app>.vercel.app/api/cron/snapshot
```

It returns `{ "ok": true, "recorded": [...] }` and writes one point per project
(`{ prs, pct, ciPassRate }`, keyed by `project + date`).

**3 — Let the cron take over**

The cron in [`vercel.json`](./vercel.json) runs daily and appends a point:

```json
{ "crons": [{ "path": "/api/cron/snapshot", "schedule": "0 7 * * *" }] }
```

(`0 7 * * *` = 07:00 UTC.) The sparklines appear on each project's detail page
(`/p/[slug]`) once there are 2–3 days of history — a single point is just a dot.
History is capped at the last 60 days.

**Protecting the route (optional).** Set a `CRON_SECRET` env var and the route
requires `Authorization: Bearer <secret>` (Vercel's cron sends it automatically).
Without it the route is open but harmless — it only records current metrics. With
it set, seed manually via:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-app>.vercel.app/api/cron/snapshot
```

---

## Replacing the daily email digest

This dashboard is a strict **superset** of the old daily Gmail digest — and it's
always current, not a once-a-day snapshot. Everything the digest reported now
lives here, first-class:

| The digest reported… | …where it is now |
| --- | --- |
| PRs shipped in 24h | Factory headline + each tile's "shipped · 24h" + the 24h delta |
| CI health | Factory headline `CI pass/total` + per-project CI dot |
| % to submission | Readiness ring + the "Since yesterday" Δreadiness |
| Pending-ops / what needs you | The **Needs you** panel (top of the Floor) + Δ new ops |
| Loop health ("is it still running?") | **Liveness dots** (green/amber/red) + a loud "may be stalled" flag |
| Loop self-audit | Latest **DEEP AUDIT** date + note from `loop-memory` |

Because the dashboard is the single source of truth, **downgrade the daily routine
to a tiny one-line push** — a nudge to come look — instead of a heavy HTML report.
Suggested daily message:

> 🏭 Factory: **N** PRs shipped (24h) · **M** need you · CI **p/t** · closest to launch **X at Y%** → `https://<your-app>.vercel.app`

That line maps exactly to the **factory headline** at the top of the Floor —
generate it from the same data (the KV snapshot the cron already writes, or a
small server call) and link straight to the dashboard for everything else. Drop
the long per-PR HTML email.

---

## Add a project (one line)

Adding a future project is a **one-line** change — append an entry to
[`config/projects.ts`](./config/projects.ts):

```ts
export const PROJECTS: ProjectConfig[] = [
  // …existing projects…
  { slug: "myapp", displayName: "MyApp", owner: "you", repo: "MyApp", kind: "ios" },
];
```

- `slug` — URL-safe, unique (becomes `/p/<slug>`).
- `branch` — **optional**; omit it and the dashboard uses the repo's GitHub
  `default_branch` automatically.
- `kind` — one of `ios` · `web` · `mobile` · `ios+web` · `web+mobile`.

As long as the new repo follows the same file conventions below, it's picked up
with no other changes.

---

## The factory file conventions (the dashboard's "API")

The dashboard parses a few markdown files from each repo's working branch. They
are the contract — keep using the same templates across projects and everything
just works. Parsing is **deliberately tolerant**; anything missing or malformed
degrades to a clear "unavailable" state rather than breaking the page.

**`ROADMAP.md`** → progress

- A heading containing **"Definition of Done"** — its `- [x]` / `- [ ]`
  checkboxes drive the headline **% to submission**.
- Headings matching **`Track A`, `Track B`, …** or **`P0`** — each becomes a
  per-track progress bar.
- Whole-file checkbox % is used as a fallback when there's no Definition of Done.

**`PENDING_OPS.md`** → action items waiting on you

- Items under a **"Pending"** section, **or** table rows whose status looks like
  `TODO`/`pending`, **or** obvious `apply/set/create …` action lines.
- `"none queued"` (any casing) → zero items.
- Missing file → zero items (with a note). Ambiguous content → the raw "Pending"
  section is surfaced rather than guessed at.

**Issues** → status & attention

- An open issue titled **`FACTORY: ready for submission`** (or **`FACTORY: 100%`**)
  flips the project to **Ready**. The ready banner surfaces the **proof** parsed
  from the issue body — the mechanical pre-flight result + a summary of the
  adversarial auditors who signed off — and links to the issue. When NOT ready, a
  **Readiness gates** panel shows the WHY: DoD checkboxes, whether
  `scripts/preflight.sh` exists, and whether the audit has run. Gates the loop
  hasn't built yet read "not yet built / not yet run" — never a failure.
- Issues titled **`loop: harness improvement proposal …`**, **`FYI …`**, or
  flagged as blockers show up in the per-project **Loop health** panel and a
  factory-wide loop-health note.

**`scripts/preflight.sh`** → the mechanical readiness gate (gate 1); its
presence/absence is observed and shown in the Readiness gates + Data sources.

**Loop liveness** — from the latest merged PR/commit: a green/amber/red dot per
project (green &lt; 8h, amber 8–18h, red &gt; 18h or quiet 24h) with a loud
"may be stalled" flag, so "is it still running?" is answerable at a glance.

**`docs/BUSINESS_CASE.md`** → estimated annual revenue (the headline value)

- **Primary (authoritative): a machine-readable `BUSINESS_CASE_SUMMARY` block** —
  a fenced YAML block near the top with `arr_year1.{conservative,base,optimistic}`,
  `planning_case`, `floor_usd`, `floor_met_year1`, `time_to_floor`, `as_of`.
  Headline = `arr_year1[planning_case]` (default base); range = conservative →
  optimistic. `floor_met_year1` + `time_to_floor` render next to the value (e.g.
  "below $100K floor in year 1"). The file's commit SHA busts the cache.
- **Fallback (no block):** a tolerant scrape of the "Three scenarios" prose — it
  binds to the figure *after* an `ARR` / `annual revenue` token, prefers an annual
  `$X/year` over a monthly `$X/month`, and ignores pricing / COGS / marketing
  dollar lines.
- A headline outside a **$1k–$500k** plausibility band, or a file with no readable
  figure, shows a "see file" link — **never a fabricated number**.
- **Absent → a clearly-labeled "rough heuristic"** fallback (LLM estimate, then a
  price×adoption formula). The UI badges every number `business case` vs
  `rough heuristic`, and the factory total keeps the two subtotals separate.

**`docs/growth/GROWTH_STATUS.md`** → growth & marketing (the Growth Agent's report)

- A machine-readable **`GROWTH_STATUS`** fenced YAML block — same discipline as the
  business case. Pre-launch leads with **waitlist / visitors / signup rate**;
  post-launch with **trials / paid / MRR / churn** plus **CAC·LTV** and the latest
  decided experiment. Real data only; a missing or garbled block degrades to a
  "see file" link, never a guessed number.
- **Quant-only extension (e.g. LLM-Quant):** two extra maps unlock a prominent
  **real-money GO panel** on that project's page —
  - `metrics:` → **weekly PnL** (`weekly_pnl_paper` / `_live`) against the
    `weekly_pnl_target_usd` profit floor, trended over KV history, plus hit rate,
    Sharpe, max drawdown, Brier calibration, trades, and weeks validated above the
    floor. Pre-edge the agent reports `null`/`0`, which shows as **"no validated
    PnL yet"** — not a fabricated result.
  - `go_live:` → the **GO signal**: `status` (`not_ready` → **"NOT READY"**;
    `eligible` → **"GO-eligible"**, the only state that reads as go), `confidence`,
    a 10-point **criteria** checklist (✓/✗ in published order), `blocking` reasons,
    and `owner_decision_required`. It **can't be faked** — the project's own
    `scripts/preflight.sh` fails CI if it flips to `eligible` without every
    criterion true, the floor met, and all Definition-of-Done boxes checked — and
    moving real money always stays a human decision. Non-quant projects simply omit
    these maps and the panel doesn't render.

**Also read (all optional):** `IMPROVEMENT_LOG.md`, and a loop-memory file at
`docs/loop-memory.md` or `docs/autonomous-loop/LOOP_MEMORY.md` — its latest
**DEEP AUDIT** date + note is shown so you can see the loop auditing itself.

**Computed status:** `ready` if the submission issue is open; else `blocked`
(needs you) if CI is failing, a PR is stuck > 12h, or an attention issue is open;
else `building` if there's any activity in 24h; else `idle`.

---

## Architecture

```
app/
  layout.tsx                 root layout · theme (no-flash) · metadata
  globals.css                warm-editorial palette (light + dark) via CSS vars
  login/                     password page
  (dashboard)/               protected route group (header/footer chrome)
    page.tsx                 / — Factory Floor overview
    p/[slug]/page.tsx        /p/[slug] — per-project page
  api/
    auth/…                   login / logout (cookie)
    cron/snapshot/route.ts   daily KV snapshot (guarded no-op without KV)
components/                  ProgressRing, StatusBadge, TrackBars, ActivityFeed,
                             ActionItemsPanel, WhatNeedsYou, CIHealth, StatCard,
                             Sparkline, ProjectCard, …
config/projects.ts          ← the one-line-to-add-a-project list
lib/
  github.ts                  getProjectSnapshot() — cached, defensive
  parsers.ts                 ROADMAP / PENDING_OPS / ready-issue parsers
  aggregate.ts               cross-project "what needs you" + feed
  narrative.ts               LLM-or-template digest
  kv.ts                      optional history (guarded)
  types.ts / utils.ts        ProjectSnapshot + UI helpers
middleware.ts                single-password gate
vercel.json                  daily cron registration
```

- **Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · React 19 RSC.
- **Caching:** `unstable_cache` + route `revalidate` (ISR) at ~600s.
- **Design:** a hand-built "warm-editorial" system (palette in `globals.css`),
  light + dark, real loading/empty/error states, accessible focus + contrast.

---

## Resilience & security

- **Never crashes on bad data.** Every GitHub call and every markdown parse is
  wrapped defensively; a failed call or missing/malformed file degrades that one
  field (with an "unavailable" state) instead of breaking the page. Each
  `ProjectSnapshot` field carries an `available` flag.
- **Handles mixed maturity.** Repos with no CI, no `ROADMAP.md`, no
  `PENDING_OPS.md`, or no Actions runs all render cleanly.
- **Token stays server-side.** `GITHUB_TOKEN` is read only in Server Components /
  route handlers — it is never sent to the browser or embedded in client JS.
- **Private by default.** The middleware gate blocks every page (except the login
  and auth/cron endpoints) until a correct password sets an httpOnly cookie.

---

Built to look like an intentionally designed product — not a generated admin
template. Add a project, point the agent at the same file templates, and it shows
up here automatically.
