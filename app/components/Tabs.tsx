"use client";

export function Tabs({
  items,
  active,
  onChange,
}: {
  items: string[];
  active: string;
  onChange: (item: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors ${
            active === item
              ? "bg-surface2 text-text"
              : "text-muted hover:text-text"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}