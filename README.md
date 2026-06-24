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
| `/`          | **Factory Floor.** Stat strip (PRs shipped today · items needing you · CI health), a card per project (progress ring, status, PRs today, CI dot, needs-you count), the aggregated **What needs you** panel, and a unified merged-PR activity feed. |
| `/p/[slug]`  | **Per project.** Big progress ring + next milestone, per-track bars, a 24-hour digest (AI or templated) with what shipped, a live "today" panel (PRs, open PRs with age + stuck flags, CI, commits), checkable action items, loop-health/attention signals, optional trend charts. |

Data is fetched server-side with [`@octokit/rest`](https://github.com/octokit/rest.js)
and cached with Next.js ISR (`revalidate ≈ 600s`), so pages are near-real-time
without hammering the API. Every page shows a live "updated _x_ ago" stamp.

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
| `ANTHROPIC_API_KEY` | — | Enables AI daily digests (`claude-sonnet-4-6`). Without it, digests are templated. |
| `ANTHROPIC_MODEL` | — | Override the digest model (default `claude-sonnet-4-6`). |
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
   - *(optional)* `ANTHROPIC_API_KEY`, `CRON_SECRET`
4. **Deploy.** That's it — the MVP is live and gated.

The daily cron in [`vercel.json`](./vercel.json) is registered automatically on
deploy (it's a no-op until you add KV — see below).

---

## Optional: AI daily narrative

Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`) to generate a 2–3
sentence per-project digest server-side with the Anthropic SDK
(`claude-sonnet-4-6`). It runs with a short timeout and **never blocks the page**
— any failure falls back to the templated summary. The per-project digest card
shows an **AI digest** vs **Summary** chip so you always know which you're seeing.

---

## Optional: history & trend charts (Vercel KV + cron)

Trend sparklines (PRs/day, %-to-submission, CI pass%) are powered by a daily
snapshot written to **Vercel KV**. This is entirely optional — without KV, the
charts are hidden and the cron route returns a no-op.

To enable:

1. Vercel → your project → **Storage → Create Database → KV** → connect it.
   Vercel injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` automatically.
2. *(Recommended)* add a `CRON_SECRET` env var to protect the snapshot route.
3. Redeploy. The cron in `vercel.json` runs daily:

   ```json
   { "crons": [{ "path": "/api/cron/snapshot", "schedule": "0 7 * * *" }] }
   ```

   (`0 7 * * *` = 07:00 UTC daily.) Each run records `{ prs, pct, ciPassRate }`
   per project keyed by `project + date`. Sparklines appear after a couple of
   days of history. You can also hit `/api/cron/snapshot` manually to backfill
   today (include the `Authorization: Bearer <CRON_SECRET>` header if set).

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

- An open issue titled exactly **`FACTORY: ready for submission`** flips the
  project to **Ready** and surfaces its checklist (or the ROADMAP "Human Core"
  section) as the submission to-do list.
- Issues titled **`loop: harness improvement proposal …`**, **`FYI …`**, or
  flagged as blockers show up in the per-project **Loop health** panel and the
  aggregated **What needs you** list.

**Also read (all optional):** `IMPROVEMENT_LOG.md`, and a loop-memory file at
`docs/loop-memory.md` or `docs/autonomous-loop/LOOP_MEMORY.md`.

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
