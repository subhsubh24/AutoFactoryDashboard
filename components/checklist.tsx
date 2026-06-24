"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon } from "@/components/icons";

/**
 * Locally-persisted "checked" set. Checking action items is convenience state
 * for the human — it never writes back to GitHub — so localStorage is enough.
 */
export function useCheckedSet(storageKey: string) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setChecked(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [storageKey]);

  const toggle = useCallback(
    (id: string) => {
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [storageKey],
  );

  return { checked, toggle, hydrated };
}

export function CheckBox({
  checked,
  onToggle,
  label,
  accent = "clay",
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  accent?: "clay" | "sage";
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border transition-colors",
        checked
          ? accent === "sage"
            ? "border-sage bg-sage text-white"
            : "border-clay bg-clay text-white"
          : "border-hairline bg-card hover:border-muted",
      )}
    >
      {checked && <CheckIcon className="h-3 w-3" />}
    </button>
  );
}
