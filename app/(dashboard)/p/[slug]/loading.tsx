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
      <Shimmer className="mb-3 h-4 w-32" />
      <Shimmer className="mb-6 h-9 w-64" />
      <Shimmer className="mb-6 h-44 w-full" />
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <div className="space-y-6">
          <Shimmer className="h-56" />
          <Shimmer className="h-56" />
        </div>
        <div className="space-y-6">
          <Shimmer className="h-40" />
          <Shimmer className="h-40" />
        </div>
      </div>
    </div>
  );
}
