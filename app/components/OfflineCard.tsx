export function OfflineCard({ message }: { message?: string }) {
  return (
    <div className="rounded-xl border border-danger/30 bg-surface p-6">
      <div className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-danger" />
        <span className="text-sm font-medium text-text">Engine offline</span>
      </div>
      <p className="mt-2 text-sm text-muted">
        {message ?? "Could not reach the Doude engine."}
      </p>
      <p className="mt-2 font-mono text-xs text-muted">
        Start the engine: uvicorn engine.main:app --port 8000
      </p>
    </div>
  );
}