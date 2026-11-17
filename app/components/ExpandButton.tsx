import { Maximize2 } from "lucide-react";

export function ExpandButton({ label = "Expand" }: { label?: string }) {
  return (
    <button type="button" aria-label={label} className="expand-btn shrink-0">
      <Maximize2 className="h-4 w-4" />
    </button>
  );
}