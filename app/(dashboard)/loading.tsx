function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse-soft rounded-lg bg-[var(--ring-track)] ${className}`}
    />
  );
}

export default function Loading() {
  return (
    <div className="animate-fade-in">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Shimmer className="h-3 w-40" />
          <Shimmer className="h-9 w-56" />
        </div>
        <Shimmer className="h-8 w-28" />
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Shimmer key={i} className="h-24" />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr] lg:items-start">
        <div className="order-2 space-y-6 lg:order-1">
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Shimmer key={i} className="h-52" />
            ))}
          </div>
          <Shimmer className="h-64" />
        </div>
        <Shimmer className="order-1 h-96 lg:order-2" />
      </div>
    </div>
  );
}
