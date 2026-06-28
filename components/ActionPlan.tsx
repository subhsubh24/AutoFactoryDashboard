"use client";

import { useState } from "react";
import type { ActionPlan as ActionPlanT, ActionPriority } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckBox, useCheckedSet } from "@/components/checklist";
import { CheckIcon, ExternalLinkIcon, SparkleIcon } from "@/components/icons";

const GROUP: Record<ActionPriority, { label: string; dot: string; head: string }> = {
  urgent: { label: "Do now", dot: "bg-clay", head: "text-clay-strong" },
  high: { label: "Next", dot: "bg-amber", head: "text-amber-strong" },
  normal: { label: "Later", dot: "bg-[var(--ring-track)]", head: "text-muted" },
};
const ORDER: ActionPriority[] = ["urgent", "high", "normal"];

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
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
 * PENDING_OPS, re-organised by the LLM into a calm, prioritised checklist: a
 * one-line triage, then items grouped Do now / Next / Later with a crisp title,
 * one-line context, a category + "human-only" tag, and the exact original
 * instructions one tap away (so nothing is lost). Checkable + locally persisted.
 */
export function ActionPlan({
  plan,
  storageKey,
  sourceUrl,
}: {
  plan: ActionPlanT;
  storageKey: string;
  sourceUrl?: string;
}) {
  const { checked, toggle, hydrated } = useCheckedSet(storageKey);
  const [open, setOpen] = useState<Set<string>>(new Set());

  if (!plan.available || plan.items.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-sage-strong">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-sage-soft">
          <CheckIcon className="h-3 w-3" />
        </span>
        Nothing queued — you&apos;re all clear.
      </div>
    );
  }

  const remaining = plan.items.filter((i) => !checked.has(i.id)).length;
  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="space-y-5">
      {/* Triage line — what to do first. */}
      {plan.summary && (
        <p className="flex items-start gap-2 text-sm leading-relaxed text-ink">
          {plan.source === "llm" && (
            <SparkleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-clay" />
          )}
          <span>{plan.summary}</span>
        </p>
      )}

      {ORDER.map((pr) => {
        const group = plan.items.filter((i) => i.priority === pr);
        if (group.length === 0) return null;
        const g = GROUP[pr];
        return (
          <div key={pr}>
            <div className="mb-2 flex items-center gap-2">
              <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", g.dot)} />
              <span
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-[0.1em]",
                  g.head,
                )}
              >
                {g.label}
              </span>
              <span className="text-[11px] tabular text-muted">{group.length}</span>
            </div>

            <ul className="space-y-2.5">
              {group.map((item) => {
                const isDone = hydrated && checked.has(item.id);
                const isOpen = open.has(item.id);
                const hasMore =
                  item.fullText.replace(/\s+/g, " ").trim() !==
                  item.title.replace(/\s+/g, " ").trim();
                return (
                  <li
                    key={item.id}
                    className="rounded-xl border border-hairline bg-card px-3.5 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <span className="pt-0.5">
                        <CheckBox
                          checked={isDone}
                          onToggle={() => toggle(item.id)}
                          label={item.title}
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p
                            className={cn(
                              "text-sm font-medium leading-snug transition-colors",
                              isDone ? "text-muted line-through" : "text-ink",
                            )}
                          >
                            {item.title}
                          </p>
                          {item.humanOnly && (
                            <span className="rounded-full bg-clay-soft px-1.5 py-0.5 text-[10px] font-medium text-clay-strong">
                              human
                            </span>
                          )}
                          {item.tag && (
                            <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] font-medium text-muted">
                              {item.tag}
                            </span>
                          )}
                        </div>
                        {item.detail && !isDone && (
                          <p className="mt-1 text-xs leading-relaxed text-muted">
                            {item.detail}
                          </p>
                        )}
                        {hasMore && !isDone && (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleOpen(item.id)}
                              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted transition-colors hover:text-clay"
                              aria-expanded={isOpen}
                            >
                              <Caret open={isOpen} />
                              {isOpen ? "Hide steps" : "Exact steps"}
                            </button>
                            {isOpen && (
                              <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-bg px-3 py-2 text-xs leading-relaxed text-muted">
                                {item.fullText}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <div className="flex items-center justify-between border-t border-hairline pt-3 text-xs text-muted">
        <span>
          {hydrated && remaining === 0
            ? "All done — nothing left. ✨"
            : `${remaining} of ${plan.items.length} left`}
        </span>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-clay"
          >
            PENDING_OPS.md <ExternalLinkIcon className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
