"use client";

import type { ActionItemsInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckBox, useCheckedSet } from "@/components/checklist";
import { CheckIcon } from "@/components/icons";

/** Per-project action items from PENDING_OPS.md — checkable, locally persisted. */
export function ActionItemsPanel({
  info,
  storageKey,
  accent = "clay",
}: {
  info: ActionItemsInfo;
  storageKey: string;
  accent?: "clay" | "sage";
}) {
  const { checked, toggle, hydrated } = useCheckedSet(storageKey);

  if (!info.available) {
    return (
      <p className="text-sm text-muted">
        {info.reason ?? "Action items unavailable."}
      </p>
    );
  }

  if (info.items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-sage-strong">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-sage-soft text-sage-strong">
            <CheckIcon className="h-3 w-3" />
          </span>
          {info.note && /none queued/i.test(info.note)
            ? "Nothing queued — you're all clear."
            : (info.note ?? "No action items.")}
        </div>
        {info.rawSection && (
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-bg p-3 text-xs text-muted">
            {info.rawSection}
          </pre>
        )}
      </div>
    );
  }

  const remaining = info.items.filter((i) => !checked.has(i.id)).length;

  return (
    <div>
      <ul className="space-y-2.5">
        {info.items.map((item) => {
          const isDone = hydrated && checked.has(item.id);
          return (
            <li key={item.id} className="flex items-start gap-3">
              <CheckBox
                checked={isDone}
                onToggle={() => toggle(item.id)}
                label={item.text}
                accent={accent}
              />
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm leading-snug transition-colors",
                    isDone ? "text-muted line-through" : "text-ink",
                  )}
                >
                  {item.text}
                </p>
                {item.howTo && (
                  <p className="mt-0.5 text-xs text-muted">{item.howTo}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {hydrated && remaining === 0 && (
        <p className="mt-3 text-xs text-sage-strong">All items checked off. ✨</p>
      )}
    </div>
  );
}
