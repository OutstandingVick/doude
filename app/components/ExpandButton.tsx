import { Maximize2 } from "lucide-react";

export function ExpandButton({
  label = "Expand",
  onClick,
}: {
  label?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="expand-btn shrink-0 transition-colors hover:bg-surface3"
    >
      <Maximize2 className="h-4 w-4" />
    </button>
  );
}
