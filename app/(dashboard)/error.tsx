"use client";

import { useEffect } from "react";
import { AlertIcon, RefreshIcon } from "@/components/icons";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error in server/client logs for debugging.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-24 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-clay-soft text-clay">
        <AlertIcon className="h-6 w-6" />
      </span>
      <div>
        <h2 className="font-serif text-xl text-ink">Something went sideways</h2>
        <p className="mt-1.5 text-sm text-muted">
          The dashboard hit an unexpected error while loading. Your data is
          fine — this is just the view.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-lg bg-clay px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        <RefreshIcon className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
