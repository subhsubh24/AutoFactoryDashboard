import { cn, type Tone } from "@/lib/utils";

/**
 * The one metadata pill used across the dashboard — provenance badges, category
 * tags, small status markers. One padding/size/radius so equivalent chips read
 * as the same kind of thing; `tone` picks the soft-background colour pair.
 */
const TONE_CLASS: Record<Tone, string> = {
  sage: "bg-sage-soft text-sage-strong",
  amber: "bg-amber-soft text-amber-strong",
  clay: "bg-clay-soft text-clay-strong",
  muted: "bg-bg text-muted",
};

export function Chip({
  tone = "muted",
  className,
  title,
  children,
}: {
  tone?: Tone;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
