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
 * A SectionCard whose header is the toggle — for deep-dive sections that add
 * length without being glance-worthy (build progress, quality, trends). Looks
 * like SectionCard; collapsed by default so the page stays calm, and the
 * open/closed choice persists per `storageKey`. Body animates via 0fr↔1fr.
 */
export function CollapsibleSection({
  title,
  subtitle,
  aside,
  defaultOpen = false,
  storageKey,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  aside?: React.ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
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
    <section className={cn("card overflow-hidden", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-bg/50"
      >
        <div className="min-w-0">
          <span className="flex items-center gap-2 text-muted transition-colors group-hover:text-clay">
            <Caret open={open} />
            <span className="text-sm font-semibold tracking-tight text-ink">{title}</span>
          </span>
          {subtitle && <p className="mt-0.5 pl-[1.375rem] text-xs text-muted">{subtitle}</p>}
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {aside}
          <span className="text-[10px] font-medium text-muted/70">{open ? "Hide" : "Show"}</span>
        </span>
      </button>
      <div
        className={cn(
          "grid",
          ready && "transition-[grid-template-rows] duration-300 ease-out",
        )}
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className={cn("border-t border-hairline p-5", bodyClassName)}>{children}</div>
        </div>
      </div>
    </section>
  );
}
