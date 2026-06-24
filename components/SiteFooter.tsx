/** Quiet footer with the add-a-project reminder. */
export function SiteFooter() {
  return (
    <footer className="relative z-10 mt-16 border-t border-hairline">
      <div className="mx-auto max-w-shell px-5 py-8 text-xs text-muted">
        <p>
          AutoFactoryDashboard — a live view of autonomous product-factory
          projects.
        </p>
        <p className="mt-1">
          Add a project by appending one entry to{" "}
          <code className="rounded bg-card px-1.5 py-0.5 font-mono text-[11px]">
            config/projects.ts
          </code>
          .
        </p>
      </div>
    </footer>
  );
}
