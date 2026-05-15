"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@root/components/ui/card";

/**
 * Donut chart card. Use for compositions ("share by channel", "share by
 * provider") rather than time series.
 */
export interface DonutChartCardProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  data: Array<{ name: string; value: number; color?: string }>;
  height?: number;
  className?: string;
  /** Big centre number — pass already-formatted. */
  centerLabel?: string;
  centerSub?: string;
}

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function DonutChartCard({
  title,
  description,
  actions,
  data,
  height = 240,
  className,
  centerLabel,
  centerSub,
}: DonutChartCardProps) {
  const total = data.reduce((acc, d) => acc + d.value, 0);

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
        <div className="relative">
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data.length ? data : [{ name: "(empty)", value: 1, color: "var(--muted)" }]}
                dataKey="value"
                nameKey="name"
                innerRadius="60%"
                outerRadius="90%"
                strokeWidth={2}
                stroke="var(--card)"
                isAnimationActive={false}
              >
                {(data.length ? data : [{ name: "(empty)", value: 1, color: "var(--muted)" }]).map(
                  (entry, i) => (
                    <Cell
                      key={entry.name}
                      fill={entry.color ?? COLORS[i % COLORS.length]}
                    />
                  ),
                )}
              </Pie>
              {data.length ? (
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    padding: "6px 10px",
                  }}
                />
              ) : null}
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
          {centerLabel ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold tabular-nums leading-none">{centerLabel}</span>
              {centerSub ? (
                <span className="mt-1 text-[11px] text-muted-foreground">{centerSub}</span>
              ) : null}
            </div>
          ) : total === 0 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              No data
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
