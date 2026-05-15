import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@root/lib/utils";
import { Card, CardContent } from "@root/components/ui/card";
import { Badge } from "@root/components/ui/badge";

/**
 * Headline number with optional delta + sparkline slot.
 *
 * Designed for the dashboard's KPI strip: large tabular number, a one-liner
 * caption beneath, optional trend badge ("+12% vs last week"), and a thin
 * inline sparkline area in the bottom-right corner. The sparkline accepts
 * any ReactNode so callers can drop in a Recharts mini chart, an icon, or
 * nothing at all.
 */
export interface KpiCardProps {
  label: string;
  value: number | string;
  hint?: string;
  /** Percent change vs prior period; positive = green, negative = red. */
  delta?: number | null;
  icon?: LucideIcon;
  /** Optional sparkline / mini-chart slot. */
  trail?: React.ReactNode;
  /** Format the number with locale grouping by default. */
  formatValue?: (v: number | string) => string;
  className?: string;
}

export function KpiCard({
  label,
  value,
  hint,
  delta,
  icon: Icon,
  trail,
  formatValue,
  className,
}: KpiCardProps) {
  const formatted =
    typeof value === "number"
      ? (formatValue ?? defaultFormat)(value)
      : value;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="flex flex-col gap-2 pt-6 pb-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </p>
          {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-3xl font-bold tabular-nums leading-none">{formatted}</span>
          {delta !== undefined && delta !== null ? <DeltaBadge delta={delta} /> : null}
        </div>
        <div className="flex items-end justify-between gap-2">
          <p className="text-xs text-muted-foreground">{hint}</p>
          {trail ? <div className="h-8 w-24 shrink-0">{trail}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <Badge variant="outline" className="text-[10px] tabular-nums">
        ±0%
      </Badge>
    );
  }
  const positive = delta > 0;
  const arrow = positive ? "↑" : "↓";
  const variant = positive ? "success" : "destructive";
  return (
    <Badge variant={variant} className="text-[10px] tabular-nums">
      {arrow} {Math.abs(delta).toFixed(1)}%
    </Badge>
  );
}

function defaultFormat(n: number | string): string {
  if (typeof n !== "number") return n;
  // Compact form for big numbers (1.2k / 12k / 1.2M).
  if (Math.abs(n) >= 10_000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat("en-US").format(n);
}
