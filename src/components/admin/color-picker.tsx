"use client";

import { PRESET_COLORS, contrastTextColor } from "@/lib/color";
import { cn } from "@/lib/utils";

export function ColorPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string | null;
  onChange: (color: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <input type="hidden" name={name} value={value ?? ""} />
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full border text-[10px] text-muted-foreground",
            !value ? "border-primary ring-2 ring-ring/40" : "border-border",
          )}
          title="No color (use default)"
        >
          &times;
        </button>
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn("h-7 w-7 rounded-full border", value === c ? "ring-2 ring-ring/60" : "border-border")}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
        <input
          type="color"
          value={value ?? "#2f6b4f"}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 cursor-pointer rounded-full border border-border bg-transparent p-0"
          title="Custom color"
        />
      </div>
      {value && (
        <div
          className="inline-flex items-center rounded-full px-2.5 py-1 text-xs"
          style={{ backgroundColor: value, color: contrastTextColor(value) }}
        >
          Preview
        </div>
      )}
    </div>
  );
}
