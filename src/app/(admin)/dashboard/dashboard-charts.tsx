"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@root/components/ui/button";
import { AreaChartCard } from "@root/components/charts/area-chart-card";
import { DonutChartCard } from "@root/components/charts/donut-chart-card";

/**
 * Client island that owns the recharts-backed cards on the dashboard.
 *
 * The dashboard page is a Server Component because it needs `auth.api.*`
 * and direct Prisma reads. Recharts components (and the formatter functions
 * they take) can't be serialised across the RSC boundary, so we lift the
 * chart code into this client component and pass it pre-computed plain
 * JSON.
 */
export interface DashboardChartsProps {
  timeline: Array<{ bucket: string; sent: number; failed: number; total: number }>;
  byChannel: Array<{ channel: string; sent: number; failed: number }>;
  totalSent: number;
}

export function DashboardCharts({ timeline, byChannel, totalSent }: DashboardChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <AreaChartCard
        title="Send volume — last 7 days"
        description="Stacked sent + failed counts per day"
        data={timeline}
        xKey="bucket"
        series={[
          { dataKey: "sent", label: "Sent", color: "var(--chart-1)" },
          { dataKey: "failed", label: "Failed", color: "var(--destructive)" },
        ]}
        className="lg:col-span-2"
        // Strip the "YYYY-" prefix client-side; the dashboard never has
        // to ship a function across the RSC boundary.
        xTickFormatter={(s) => s.slice(5)}
        showYAxis
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/analytics">
              Details
              <ArrowUpRight />
            </Link>
          </Button>
        }
      />
      <DonutChartCard
        title="Channel mix"
        description="Successful sends by channel"
        data={byChannel.map((c, i) => ({
          name: c.channel,
          value: c.sent,
          color: `var(--chart-${(i % 5) + 1})`,
        }))}
        centerLabel={totalSent.toLocaleString()}
        centerSub="total sent"
      />
    </div>
  );
}
