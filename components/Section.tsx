import { cn } from "@/lib/utils";

/**
 * Card with a hairline header — the standard content container. Flat
 * (border-only) by default so elevation can mean something; pass `elevated` for
 * a focal moment that should lift off the page.
 */
export function SectionCard({
  title,
  subtitle,
  aside,
  children,
  className,
  bodyClassName,
  headerClassName,
  elevated = false,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  elevated?: boolean;
}) {
  return (
    <section className={cn("card overflow-hidden", elevated && "shadow-card", className)}>
      <header
        className={cn(
          "flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5",
          headerClassName,
        )}
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
          )}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
