import Link from "next/link";
import { isAuthConfigured } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Thin top bar shown on every protected page. */
export function SiteHeader() {
  const showLogout = isAuthConfigured();

  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-shell items-center justify-between px-5">
        <Link
          href="/"
          className="group flex items-center gap-2.5"
          aria-label="AutoFactoryDashboard home"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink">
            <RingMark />
          </span>
          <span className="font-serif text-[15px] font-medium tracking-tight text-ink">
            AutoFactory
            <span className="text-muted">Dashboard</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {showLogout && (
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="rounded-lg border border-hairline bg-card px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
              >
                Sign out
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}

function RingMark() {
  return (
    // Colours come from CSS vars so the mark tracks the theme — the ink chip it
    // sits in inverts between light/dark, and these invert with it.
    <svg viewBox="0 0 32 32" className="h-4 w-4" aria-hidden="true">
      <circle
        cx="16"
        cy="16"
        r="9"
        fill="none"
        style={{ stroke: "var(--muted)" }}
        strokeWidth="3"
      />
      <path
        d="M16 7a9 9 0 0 1 7.8 13.5"
        fill="none"
        style={{ stroke: "var(--clay)" }}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="2.4" style={{ fill: "var(--bg)" }} />
    </svg>
  );
}
