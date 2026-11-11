export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-surface2 ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}