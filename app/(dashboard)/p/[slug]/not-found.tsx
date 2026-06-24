import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="font-serif text-5xl text-clay">404</p>
      <div>
        <h2 className="font-serif text-xl text-ink">Project not found</h2>
        <p className="mt-1.5 text-sm text-muted">
          No project matches that slug. Add it to{" "}
          <code className="font-mono text-xs">config/projects.ts</code> or head
          back to the floor.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-lg bg-clay px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Factory Floor
      </Link>
    </div>
  );
}
