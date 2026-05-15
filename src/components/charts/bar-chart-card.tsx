"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@root/components/ui/card";

/**
 * Bar (grouped or stacked) chart card. Same series-list contract as
 * AreaChartCard so callers can swap chart styles without restructuring data.
 */
export interface BarChartCardProps<TRow extends Record<string, unknown>> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  data: TRow[];
  xKey: keyof TRow & string;
  series: Array<{ dataKey: keyof TRow & string; label?: string; color?: string; stackId?: string }>;
  height?: number;
  className?: string;
  horizontal?: boolean;
  xTickFormatter?: (value: string) => string;
}

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function BarChartCard<TRow extends Record<string, unknown>>({
  title,
  description,
  actions,
  data,
  xKey,
  series,
  height = 240,
  className,
  horizontal = false,
  xTickFormatter,
}: BarChartCardProps<TRow>) {
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
          <BarChart
            data={data}
            layout={horizontal ? "vertical" : "horizontal"}
            margin={{ top: 4, right: 12, left: horizontal ? 80 : 0, bottom: 4 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            {horizontal ? (
              <>
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey={xKey as string}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  width={80}
                />
              </>
            ) : (
              <>
                <XAxis
                  dataKey={xKey as string}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickFormatter={xTickFormatter}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  width={40}
                />
              </>
            )}
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                padding: "6px 10px",
              }}
              cursor={{ fill: "var(--accent)" }}
            />
            {series.map((s, i) => (
              <Bar
                key={s.dataKey}
                dataKey={s.dataKey as string}
                name={s.label ?? s.dataKey}
                stackId={s.stackId}
                fill={s.color ?? COLORS[i % COLORS.length]}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
