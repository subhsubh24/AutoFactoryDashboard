import type { ProjectStatus } from "@/lib/types";
import { cn, statusMeta, toneClasses } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
  size = "md",
}: {
  status: ProjectStatus;
  className?: string;
  size?: "sm" | "md";
}) {
  const meta = statusMeta(status);
  const tone = toneClasses(meta.tone);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        tone.badge,
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone.dot,
          meta.live && "animate-pulse-soft",
        )}
      />
      {meta.label}
    </span>
  );
}
