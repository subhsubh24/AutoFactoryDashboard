import type { Metadata } from "next";
import { isAuthConfigured, sanitizeNext } from "@/lib/auth";
import { LockIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const hasError = sp.error === "1";
  const next = sanitizeNext(sp.next);
  const configured = isAuthConfigured();

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-bg">
            <LockIcon className="h-5 w-5" />
          </div>
          <h1 className="font-serif text-2xl tracking-tight text-ink">
            AutoFactoryDashboard
          </h1>
          <p className="mt-1 text-sm text-muted">
            This factory floor is private.
          </p>
        </div>

        <form
          action="/api/auth"
          method="POST"
          className="card p-6 shadow-card"
        >
          <input type="hidden" name="next" value={next} />
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-medium text-ink"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            placeholder="Enter dashboard password"
            className="w-full rounded-lg border border-hairline bg-bg px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-clay"
          />

          {hasError && (
            <p
              role="alert"
              className="mt-3 rounded-lg bg-clay-soft px-3 py-2 text-sm text-clay"
            >
              Incorrect password. Try again.
            </p>
          )}

          {!configured && (
            <p className="mt-3 rounded-lg bg-amber-soft px-3 py-2 text-xs text-amber">
              No <code className="font-mono">DASHBOARD_PASSWORD</code> is set, so
              the gate is currently disabled — any value signs you in.
            </p>
          )}

          <button
            type="submit"
            className="mt-5 w-full rounded-lg bg-clay px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          A live view of autonomous product-factory projects.
        </p>
      </div>
    </main>
  );
}
