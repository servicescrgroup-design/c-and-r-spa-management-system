"use client";

import { useMemo, useState } from "react";
import { formatCents } from "@/lib/utils";
import type { BranchSeries, Granularity } from "@/lib/admin/dashboard-data";

// Validated categorical palette (dataviz skill reference palette, slots 1-4):
// passes CVD-separation and normal-vision-floor checks in both light and dark.
const SERIES_COLORS_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const SERIES_COLORS_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500"];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function tickLabel(bucket: string, granularity: Granularity): string {
  if (granularity === "hour") return `${bucket}:00`;
  if (granularity === "month") return MONTH_LABELS[Number(bucket.split("-")[1]) - 1] ?? bucket;
  return String(Number(bucket.split("-")[2]));
}

function shouldShowTick(count: number, index: number): boolean {
  if (count <= 12) return true;
  const step = Math.ceil(count / 10);
  return index % step === 0 || index === count - 1;
}

export function RevenueChart({ buckets, series, granularity }: { buckets: string[]; series: BranchSeries[]; granularity: Granularity }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 960;
  const height = 320;
  const padding = { top: 16, right: 16, bottom: 32, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const maxValue = useMemo(() => {
    let max = 0;
    for (const s of series) for (const v of s.values) if (v > max) max = v;
    return max === 0 ? 100 : max * 1.15;
  }, [series]);

  const xFor = (i: number) => (buckets.length <= 1 ? padding.left : padding.left + (i / (buckets.length - 1)) * plotWidth);
  const yFor = (v: number) => padding.top + plotHeight - (v / maxValue) * plotHeight;

  const pathFor = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`).join(" ");

  const gridLines = 4;
  const hasData = series.some((s) => s.values.some((v) => v > 0));

  function handleMove(event: React.MouseEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = Math.min(1, Math.max(0, (x - padding.left) / plotWidth));
    const idx = Math.round(ratio * (buckets.length - 1));
    setHoverIndex(Math.min(buckets.length - 1, Math.max(0, idx)));
  }

  return (
    <div
      className="viz-root space-y-3"
      style={
        {
          "--series-1": SERIES_COLORS_LIGHT[0],
          "--series-2": SERIES_COLORS_LIGHT[1],
          "--series-3": SERIES_COLORS_LIGHT[2],
          "--series-4": SERIES_COLORS_LIGHT[3],
        } as React.CSSProperties
      }
    >
      <style>{`
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) .viz-root {
            --series-1: ${SERIES_COLORS_DARK[0]};
            --series-2: ${SERIES_COLORS_DARK[1]};
            --series-3: ${SERIES_COLORS_DARK[2]};
            --series-4: ${SERIES_COLORS_DARK[3]};
          }
        }
        :root[data-theme="dark"] .viz-root {
          --series-1: ${SERIES_COLORS_DARK[0]};
          --series-2: ${SERIES_COLORS_DARK[1]};
          --series-3: ${SERIES_COLORS_DARK[2]};
          --series-4: ${SERIES_COLORS_DARK[3]};
        }
      `}</style>

      <div className="flex flex-wrap gap-4">
        {series.map((s, i) => (
          <div key={s.branchId} className="flex items-center gap-1.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: `var(--series-${(i % 4) + 1})` }} />
            <span className="text-muted-foreground">{s.branchName}</span>
          </div>
        ))}
      </div>

      {!hasData ? (
        <p className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
          No completed sales in this range yet.
        </p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Revenue by branch over time">
          {Array.from({ length: gridLines + 1 }, (_, i) => {
            const y = padding.top + (i / gridLines) * plotHeight;
            const value = maxValue * (1 - i / gridLines);
            return (
              <g key={i}>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--color-border)" strokeWidth={1} />
                <text x={padding.left - 8} y={y} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
                  {formatCents(value).replace(/\.00$/, "")}
                </text>
              </g>
            );
          })}

          {buckets.map((b, i) =>
            shouldShowTick(buckets.length, i) ? (
              <text key={b} x={xFor(i)} y={height - padding.bottom + 16} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {tickLabel(b, granularity)}
              </text>
            ) : null,
          )}

          {series.map((s, i) => (
            <path
              key={s.branchId}
              d={pathFor(s.values)}
              fill="none"
              stroke={`var(--series-${(i % 4) + 1})`}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {hoverIndex !== null && (
            <line
              x1={xFor(hoverIndex)}
              x2={xFor(hoverIndex)}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="var(--color-foreground)"
              strokeOpacity={0.2}
              strokeWidth={1}
            />
          )}
          {hoverIndex !== null &&
            series.map((s, i) => (
              <circle
                key={s.branchId}
                cx={xFor(hoverIndex)}
                cy={yFor(s.values[hoverIndex])}
                r={4}
                fill={`var(--series-${(i % 4) + 1})`}
                stroke="var(--color-card)"
                strokeWidth={1.5}
              />
            ))}

          <rect
            x={padding.left}
            y={padding.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIndex(null)}
          />
        </svg>
      )}

      {hoverIndex !== null && (
        <div className="rounded-xl border border-border bg-card p-3 text-sm shadow-sm">
          <p className="mb-1 font-medium">{tickLabel(buckets[hoverIndex], granularity)}</p>
          <div className="space-y-1">
            {series.map((s, i) => (
              <div key={s.branchId} className="flex items-center justify-between gap-6">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `var(--series-${(i % 4) + 1})` }} />
                  {s.branchName}
                </span>
                <span>{formatCents(s.values[hoverIndex])}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
