"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TrendingUp, Camera } from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrency, useScope } from "@/lib/hooks";

const SVG_W = 600;
const SVG_H = 192;
const PAD = { top: 16, right: 16, bottom: 4, left: 70 };

const NICE_INTERVALS = [
  500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000,
  100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000,
];

function niceTickValues(minVal: number, maxVal: number): number[] {
  const range = maxVal - minVal;
  if (range === 0) return [minVal];
  const target = range / 3;
  const interval = NICE_INTERVALS.find((v) => v >= target) ?? NICE_INTERVALS[NICE_INTERVALS.length - 1];
  const first = Math.ceil(minVal / interval) * interval;
  const ticks: number[] = [];
  for (let t = first; t <= maxVal; t += interval) ticks.push(t);
  if (ticks.length === 0) ticks.push(Math.round((minVal + maxVal) / 2));
  return ticks;
}

function abbrevCurrency(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}K`;
  return `${sign}$${abs}`;
}

function LineChart({
  snapshots,
  minVal,
  rawRange,
  flat,
  formatCurrency,
}: {
  snapshots: { date: string; net_worth: number; assets: number; liabilities: number }[];
  minVal: number;
  rawRange: number;
  flat: boolean;
  formatCurrency: (v: number) => string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const plotW = SVG_W - PAD.left - PAD.right;
  const plotH = SVG_H - PAD.top - PAD.bottom;
  const maxVal = minVal + (rawRange || 1);
  const ticks = niceTickValues(flat ? minVal : minVal, flat ? minVal : maxVal);

  function x(i: number) {
    return PAD.left + (snapshots.length === 1 ? plotW / 2 : (i / (snapshots.length - 1)) * plotW);
  }
  function y(val: number) {
    if (flat) return PAD.top + plotH / 2;
    return PAD.top + plotH - ((val - minVal) / rawRange) * plotH;
  }

  const points = snapshots.map((s, i) => `${x(i)},${y(s.net_worth)}`).join(" ");
  const areaPoints = [
    ...snapshots.map((s, i) => `${x(i)},${y(s.net_worth)}`),
    `${x(snapshots.length - 1)},${PAD.top + plotH}`,
    `${x(0)},${PAD.top + plotH}`,
  ].join(" ");

  return (
    <div className="relative mt-4 h-48">
      <svg
        data-testid="nw-chart"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        onMouseLeave={() => setHovered(null)}
      >
        {ticks.map((t) => {
          const ty = flat ? PAD.top + plotH / 2 : PAD.top + plotH - ((t - minVal) / rawRange) * plotH;
          return (
            <g key={`grid-${t}`}>
              <line
                x1={PAD.left}
                y1={ty}
                x2={SVG_W - PAD.right}
                y2={ty}
                stroke="currentColor"
                className="text-muted-foreground/20"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={PAD.left - 6}
                y={ty + 1}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[11px]"
                vectorEffect="non-scaling-stroke"
              >
                {abbrevCurrency(t)}
              </text>
            </g>
          );
        })}
        <polygon points={areaPoints} className="fill-accent/15" />
        {snapshots.length > 1 && (
          <polyline
            points={points}
            fill="none"
            className="stroke-accent"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {snapshots.map((s, i) => (
          <circle
            key={s.date}
            cx={x(i)}
            cy={y(s.net_worth)}
            r={hovered === i || snapshots.length === 1 ? 5 : 3}
            className={`fill-accent stroke-card ${hovered === i ? "opacity-100" : "opacity-0 hover:opacity-100"}`}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            onMouseEnter={() => setHovered(i)}
          />
        ))}
        {snapshots.map((_, i) => (
          <rect
            key={`hit-${i}`}
            x={x(i) - (plotW / snapshots.length) / 2}
            y={0}
            width={plotW / snapshots.length}
            height={SVG_H}
            fill="transparent"
            onMouseEnter={() => setHovered(i)}
          />
        ))}
      </svg>
      {hovered !== null && snapshots[hovered] && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl whitespace-nowrap"
          style={{
            left: `${(x(hovered) / SVG_W) * 100}%`,
            bottom: `${((SVG_H - y(snapshots[hovered].net_worth)) / SVG_H) * 100 + 4}%`,
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-medium">{formatCurrency(snapshots[hovered].net_worth)}</p>
          <p className="text-muted-foreground">{snapshots[hovered].date}</p>
          <p className="text-muted-foreground">Assets: {formatCurrency(snapshots[hovered].assets)}</p>
          <p className="text-muted-foreground">Liabilities: {formatCurrency(snapshots[hovered].liabilities)}</p>
        </div>
      )}
    </div>
  );
}

export default function NetWorthHistory() {
  const formatCurrency = useFormatCurrency();
  const scope = useScope();
  const queryClient = useQueryClient();
  const [months, setMonths] = useState(12);

  const { data: snapshots, isLoading, isError, refetch } = useQuery({
    queryKey: ["netWorthHistory", months, scope],
    queryFn: () => api.getNetWorthHistory(months, scope),
  });

  const snapshotMutation = useMutation({
    mutationFn: api.takeNetWorthSnapshot,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["netWorthHistory"] }),
  });

  if (isError)
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-red-400">
          Failed to load.{" "}
          <button onClick={() => refetch()} className="text-accent hover:underline">
            Retry
          </button>
        </p>
      </div>
    );

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-medium text-muted-foreground">
            Net Worth History
          </h3>
        </div>
        <div className="mt-4 h-48 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!snapshots || snapshots.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-medium text-muted-foreground">
              Net Worth History
            </h3>
          </div>
          <button
            onClick={() => snapshotMutation.mutate()}
            disabled={snapshotMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Camera className="h-3 w-3" />
            Snapshot
          </button>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          No historical data yet. Snapshots are taken automatically during sync,
          or you can take one manually.
        </p>
      </div>
    );
  }

  const values = snapshots.map((s) => s.net_worth);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const rawRange = maxVal - minVal;
  const flat = rawRange === 0;

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const change = last.net_worth - first.net_worth;
  const changePercent =
    first.net_worth !== 0
      ? ((change / Math.abs(first.net_worth)) * 100).toFixed(1)
      : "0";

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-medium text-muted-foreground">
            Net Worth History
          </h3>
          {snapshots.length > 1 && (
            <span
              className={`ml-2 text-xs font-medium ${
                change >= 0 ? "text-success" : "text-danger"
              }`}
            >
              {change >= 0 ? "+" : ""}
              {formatCurrency(change)} ({changePercent}%)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground outline-none cursor-pointer"
          >
            <option value={3}>3 months</option>
            <option value={6}>6 months</option>
            <option value={12}>1 year</option>
            <option value={24}>2 years</option>
          </select>
          <button
            onClick={() => snapshotMutation.mutate()}
            disabled={snapshotMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Camera className="h-3 w-3" />
            Snapshot
          </button>
        </div>
      </div>

      <LineChart snapshots={snapshots} minVal={minVal} rawRange={rawRange} flat={flat} formatCurrency={formatCurrency} />

      {snapshots.length === 1 ? (
        <div className="mt-2 text-center text-[10px] text-muted-foreground">
          <span>{snapshots[0].date}</span>
        </div>
      ) : snapshots.length > 1 ? (
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>{snapshots[0].date}</span>
          <span>{snapshots[snapshots.length - 1].date}</span>
        </div>
      ) : null}
    </div>
  );
}
