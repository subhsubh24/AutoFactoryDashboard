"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", open && "rotate-90")}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 3l3 3-3 3" />
    </svg>
  );
}

/**
 * A click-to-toggle disclosure: collapse a long section to minimise it, expand
 * to read it. The body animates open/closed at its natural height (the grid
 * 0fr↔1fr trick). When `storageKey` is set, the open/closed choice persists.
 */
export function Collapsible({
  title,
  count,
  defaultOpen = true,
  storageKey,
  children,
  className,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  storageKey?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Transition only after mount, so restoring a saved state doesn't animate on load.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (storageKey) {
      try {
        const v = localStorage.getItem(storageKey);
        if (v === "0") setOpen(false);
        else if (v === "1") setOpen(true);
      } catch {
        /* ignore */
      }
    }
    setReady(true);
  }, [storageKey]);

  const toggle = () =>
    setOpen((o) => {
      const next = !o;
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, next ? "1" : "0");
        } catch {
          /* ignore */
        }
      }
      return next;
    });

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted transition-colors hover:text-clay"
      >
        <Caret open={open} />
        <span>{title}</span>
        {count != null && count > 0 && (
          <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] font-medium tabular text-muted transition-colors group-hover:text-clay">
            {count}
          </span>
        )}
        <span className="ml-auto text-[10px] font-normal normal-case tracking-normal text-muted/60">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      <div
        className={cn("grid", ready && "transition-[grid-template-rows] duration-300 ease-out")}
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="pt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
