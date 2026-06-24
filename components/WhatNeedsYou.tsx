"use client";

import Link from "next/link";
import type { NeedEntry, NeedKind } from "@/lib/aggregate";
import { cn, type Tone } from "@/lib/utils";
import { CheckBox, useCheckedSet } from "@/components/checklist";
import { ExternalLinkIcon, SparkleIcon } from "@/components/icons";

const KIND_CHIP: Record<NeedKind, { label: string; tone: Tone }> = {
  ready: { label: "Ship", tone: "sage" },
  blocker: { label: "Blocker", tone: "clay" },
  ci: { label: "CI", tone: "clay" },
  stuck: { label: "PR", tone: "amber" },
  proposal: { label: "Proposal", tone: "muted" },
  fyi: { label: "FYI", tone: "muted" },
  action: { label: "Action", tone: "clay" },
};

const CHIP_CLASS: Record<Tone, string> = {
  sage: "bg-sage-soft text-sage",
  amber: "bg-amber-soft text-amber",
  clay: "bg-clay-soft text-clay",
  muted: "bg-bg text-muted",
};

export function WhatNeedsYou({ needs }: { needs: NeedEntry[] }) {
  const { checked, toggle, hydrated } = useCheckedSet("afd-needs");

  if (needs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-sage-soft text-sage">
          <SparkleIcon className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-ink">Nothing needs you.</p>
        <p className="max-w-xs text-xs text-muted">
          The factory is running itself — no blockers, no queued ops, nothing
          waiting on a human.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {needs.map((need) => {
        const isDone = hydrated && checked.has(need.id);
        const chip = KIND_CHIP[need.kind];
        const isReady = need.kind === "ready";
        return (
          <li
            key={need.id}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3 transition-colors",
              isReady
                ? "border-sage/30 bg-sage-soft/50"
                : "border-hairline bg-card",
              isDone && "opacity-60",
            )}
          >
            <CheckBox
              checked={isDone}
              onToggle={() => toggle(need.id)}
              label={need.text}
              accent={isReady ? "sage" : "clay"}
            />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <Link
                  href={`/p/${need.projectSlug}`}
                  className="text-[11px] font-semibold uppercase tracking-wide text-muted transition-colors hover:text-clay"
                >
                  {need.projectName}
                </Link>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    CHIP_CLASS[chip.tone],
                  )}
                >
                  {chip.label}
                </span>
              </div>
              <p
                className={cn(
                  "text-sm leading-snug",
                  isDone ? "text-muted line-through" : "text-ink",
                )}
              >
                {need.text}
              </p>
              {need.howTo && (
                <p className="mt-0.5 text-xs text-muted">{need.howTo}</p>
              )}
            </div>
            {need.url && (
              <a
                href={need.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open on GitHub"
                className="mt-0.5 shrink-0 text-muted transition-colors hover:text-clay"
              >
                <ExternalLinkIcon className="h-4 w-4" />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
