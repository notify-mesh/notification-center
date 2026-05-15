"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@root/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@root/components/ui/card";

/**
 * Stacked area chart card for time-series. Each entry in `series` becomes
 * one filled stroke; the X axis is `xKey`, the Y values come from `series[i].dataKey`.
 *
 * Colors default to the shadcn token palette so the chart inherits dark mode
 * without per-component theming.
 */
export interface AreaChartCardProps<TRow extends Record<string, unknown>> {
  title: string;
  description?: string;
  /** Right-aligned card-header action slot. */
  actions?: React.ReactNode;
  data: TRow[];
  xKey: keyof TRow & string;
  /**
   * Each series → one Area. `color` falls back to a Tailwind chart token.
   * `stackId` lets you stack two series visually.
   */
  series: Array<{
    dataKey: keyof TRow & string;
    label?: string;
    color?: string;
    stackId?: string;
  }>;
  /** Pixel height — varies by usage; defaults to 240. */
  height?: number;
  className?: string;
  /** Override the X tick formatter (e.g. `"2025-01-12"` → `"Jan 12"`). */
  xTickFormatter?: (value: string) => string;
  /** Y axis label hidden by default for compactness. */
  showYAxis?: boolean;
}

const DEFAULT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function AreaChartCard<TRow extends Record<string, unknown>>({
  title,
  description,
  actions,
  data,
  xKey,
  series,
  height = 240,
  className,
  xTickFormatter,
  showYAxis = false,
}: AreaChartCardProps<TRow>) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions}
      </CardHeader>
      <CardContent className="pb-4">
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient
                  key={s.dataKey}
                  id={`grad-${s.dataKey}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="100%"
                    stopColor={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey={xKey as string}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={xTickFormatter}
            />
            {showYAxis ? (
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                width={40}
              />
            ) : null}
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                padding: "6px 10px",
              }}
              labelStyle={{ color: "var(--muted-foreground)", fontWeight: 500 }}
              cursor={{ stroke: "var(--border)" }}
            />
            {series.map((s, i) => {
              const color = s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length];
              return (
                <Area
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey as string}
                  name={s.label ?? s.dataKey}
                  stackId={s.stackId}
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#grad-${s.dataKey})`}
                  isAnimationActive={false}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/**
 * Bare sparkline — no axes, no grid, no tooltip. Designed to live inside a
 * KPI card. Single series only.
 */
export function Sparkline<TRow extends Record<string, unknown>>({
  data,
  xKey,
  dataKey,
  color,
  className,
}: {
  data: TRow[];
  xKey: keyof TRow & string;
  dataKey: keyof TRow & string;
  color?: string;
  className?: string;
}) {
  return (
    <div className={cn("h-full w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
          <defs>
            <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color ?? "var(--primary)"} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color ?? "var(--primary)"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey={xKey as string} hide />
          <YAxis hide />
          <Area
            type="monotone"
            dataKey={dataKey as string}
            stroke={color ?? "var(--primary)"}
            strokeWidth={1.5}
            fill={`url(#spark-${dataKey})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
