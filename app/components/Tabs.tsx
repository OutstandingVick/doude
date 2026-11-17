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
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`h-8 rounded-[10px] px-3.5 text-[13px] font-medium transition-colors ${
            active === item ? "bg-text text-white" : "bg-surface3 text-text hover:bg-border"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}