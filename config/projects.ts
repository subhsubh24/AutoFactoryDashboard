/**
 * Factory projects.
 *
 * ────────────────────────────────────────────────────────────────────────
 *  Adding a project is a ONE-LINE change: append an entry to the array below.
 * ────────────────────────────────────────────────────────────────────────
 *
 *  - `branch` is OPTIONAL. If omitted, the data layer fetches the repo's
 *    GitHub `default_branch` and uses that as the working branch.
 *  - `slug` must be URL-safe and unique (it's the /p/[slug] route segment).
 *
 *  The dashboard reads ROADMAP.md / PENDING_OPS.md / issues from the working
 *  branch of each repo, so as long as a new project follows the same file
 *  templates it is picked up automatically with just the config entry.
 */

export type ProjectKind = "ios" | "web" | "mobile" | "ios+web" | "web+mobile";

export interface ProjectConfig {
  /** URL-safe unique id; used as the /p/[slug] route. */
  slug: string;
  /** Human-friendly name shown in the UI. */
  displayName: string;
  /** GitHub owner / org. */
  owner: string;
  /** GitHub repository name. */
  repo: string;
  /** Working branch. Omit to use the repo's GitHub default_branch. */
  branch?: string;
  /** What surface(s) the project ships to — drives a small badge. */
  kind: ProjectKind;
  /** Live deployment URL for the product itself (optional). */
  appUrl?: string;
}

export const PROJECTS: ProjectConfig[] = [
  {
    slug: "aptdesignerai",
    displayName: "AptDesignerAI",
    owner: "subhsubh24",
    repo: "AptDesignerAI",
    branch: "claude/ai-apartment-design-app-iHAdb",
    kind: "web+mobile",
    appUrl: "https://apt-designer-ai.vercel.app/",
  },
  {
    slug: "highlightmagic",
    displayName: "HighlightMagic",
    owner: "subhsubh24",
    repo: "HighlightMagic",
    branch: "main",
    kind: "ios+web",
    appUrl: "https://highlight-magic.vercel.app/",
  },
  {
    slug: "grocerymanager",
    displayName: "GroceryManager",
    owner: "subhsubh24",
    repo: "GroceryManager",
    // branch omitted → data layer uses the repo's default_branch
    kind: "web+mobile",
    appUrl: "https://grocery-manager-web.vercel.app/",
  },
  {
    slug: "jobscraper",
    displayName: "JobScraper",
    owner: "subhsubh24",
    repo: "JobScraper",
    // branch omitted → data layer uses the repo's default_branch (main)
    kind: "web+mobile",
    appUrl: "https://job-scraper-peach.vercel.app/",
  },
  {
    slug: "llm-quant",
    displayName: "LLM-Quant",
    owner: "subhsubh24",
    repo: "LLM-Quant",
    branch: "claude/llm-stock-trading-app-fXupf",
    kind: "web",
    appUrl: "https://llm-quant-six.vercel.app/",
  },
];

/** Look up a single project by its slug. */
export function getProjectBySlug(slug: string): ProjectConfig | undefined {
  return PROJECTS.find((p) => p.slug === slug);
}
