"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, FileText, Gauge, Send, Wallet } from "lucide-react";
import { client } from "@root/lib/orpc/client";
import { KpiCard } from "@root/components/charts/kpi-card";
import { Sparkline, AreaChartCard } from "@root/components/charts/area-chart-card";
import { BarChartCard } from "@root/components/charts/bar-chart-card";
import { DonutChartCard } from "@root/components/charts/donut-chart-card";
import { Button } from "@root/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@root/components/ui/card";
import { Badge } from "@root/components/ui/badge";
import { Label } from "@root/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@root/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@root/components/ui/table";
import { Skeleton } from "@root/components/ui/skeleton";

const ANY = "__any__";
const RANGES = [
  { value: 1, label: "Last 24 hours" },
  { value: 7, label: "Last 7 days" },
  { value: 14, label: "Last 14 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
] as const;
const CHANNELS = ["sms", "email", "push", "bale", "telegram"] as const;

export function AnalyticsClient() {
  const projectsQuery = useQuery({
    queryKey: ["projects", false],
    queryFn: async () => (await client.projects.list({ includeArchived: false })).projects,
  });
  const projects = projectsQuery.data ?? [];

  const [projectId, setProjectId] = React.useState<string>(ANY);
  const envsQuery = useQuery({
    queryKey: ["environments", projectId],
    enabled: projectId !== ANY,
    queryFn: async () =>
      (await client.environments.list({ projectId })).environments,
  });
  const envs = envsQuery.data ?? [];
  const [environmentId, setEnvironmentId] = React.useState<string>(ANY);
  const [channel, setChannel] = React.useState<string>(ANY);
  const [sinceDays, setSinceDays] = React.useState<number>(7);

  const filters = {
    projectId: projectId === ANY ? undefined : projectId,
    environmentId: environmentId === ANY ? undefined : environmentId,
    channel: channel === ANY ? undefined : channel,
    sinceDays,
  };

  const summaryQuery = useQuery({
    queryKey: ["analytics", "summary", filters],
    queryFn: async () => client.analytics.summary(filters),
  });
  const summary = summaryQuery.data;

  return (
    <div className="flex flex-col gap-6">
      {/* ----------- Filter bar ----------- */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6 pb-6">
          <FilterField label="Range">
            <Select value={String(sinceDays)} onValueChange={(v) => setSinceDays(Number(v))}>
              <SelectTrigger size="sm" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.value} value={String(r.value)}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Project">
            <Select
              value={projectId}
              onValueChange={(v) => {
                setProjectId(v);
                setEnvironmentId(ANY);
              }}
            >
              <SelectTrigger size="sm" className="w-56">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Environment">
            <Select
              value={environmentId}
              onValueChange={setEnvironmentId}
              disabled={projectId === ANY}
            >
              <SelectTrigger size="sm" className="w-44">
                <SelectValue placeholder="All envs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All envs</SelectItem>
                {envs.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Channel">
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All channels</SelectItem>
                {CHANNELS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <div className="ml-auto flex items-center gap-2">
            <ExportButton
              filters={filters}
              since={summary?.range.since}
              until={summary?.range.until}
            />
          </div>
        </CardContent>
      </Card>

      {/* ----------- KPI strip ----------- */}
      {summaryQuery.isLoading || !summary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Sent"
            value={summary.totals.sent}
            hint={`${summary.totals.deliveryRatePct}% delivery rate`}
            icon={Send}
            delta={pctDelta(summary.totals.sent, summary.prior.sent)}
            trail={
              <Sparkline
                data={summary.timeline}
                xKey="bucket"
                dataKey="sent"
                color="var(--chart-1)"
              />
            }
          />
          <KpiCard
            label="Failed"
            value={summary.totals.failed}
            hint={`${summary.totals.failureRatePct}% failure rate`}
            icon={AlertTriangle}
            delta={
              // Failed delta is "good when negative" — we render the raw delta
              // (positive = bad). Card colour-codes appropriately.
              pctDelta(summary.totals.failed, summary.prior.failed)
            }
            trail={
              <Sparkline
                data={summary.timeline}
                xKey="bucket"
                dataKey="failed"
                color="var(--destructive)"
              />
            }
          />
          <KpiCard
            label="Latency p95"
            value={`${summary.latency.p95} ms`}
            hint={`p50 ${summary.latency.p50}ms · p99 ${summary.latency.p99}ms`}
            icon={Gauge}
          />
          <KpiCard
            label="Cost"
            value={summary.costIrr.total.toLocaleString()}
            hint="IRR over the selected range"
            icon={Wallet}
          />
        </div>
      )}

      {/* ----------- Timeline + Channel mix ----------- */}
      {summary ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <AreaChartCard
            title="Send volume"
            description={`Bucketed by ${summary.range.bucket} · ${summary.totals.sent.toLocaleString()} sent, ${summary.totals.failed.toLocaleString()} failed`}
            data={summary.timeline}
            xKey="bucket"
            series={[
              { dataKey: "sent", label: "Sent", color: "var(--chart-1)" },
              { dataKey: "failed", label: "Failed", color: "var(--destructive)" },
            ]}
            className="lg:col-span-2"
            xTickFormatter={(s) => formatBucketTick(s, summary.range.bucket)}
            showYAxis
          />
          <DonutChartCard
            title="Channel mix"
            description="Share of successful sends"
            data={summary.byChannel.map((c, i) => ({
              name: c.channel,
              value: c.sent,
              color: `var(--chart-${(i % 5) + 1})`,
            }))}
            centerLabel={summary.totals.sent.toLocaleString()}
            centerSub="total sent"
          />
        </div>
      ) : null}

      {/* ----------- Providers + Cost-per-day ----------- */}
      {summary ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <BarChartCard
            title="By provider"
            description="Stacked sent / failed per provider"
            data={summary.byProvider}
            xKey="provider"
            series={[
              { dataKey: "sent", label: "Sent", color: "var(--chart-1)", stackId: "p" },
              { dataKey: "failed", label: "Failed", color: "var(--destructive)", stackId: "p" },
            ]}
          />
          <BarChartCard
            title="Cost per period"
            description="IRR spend bucketed alongside the timeline"
            data={summary.costIrr.perDay}
            xKey="bucket"
            series={[{ dataKey: "cost", label: "IRR", color: "var(--chart-4)" }]}
            xTickFormatter={(s) => formatBucketTick(s, summary.range.bucket)}
          />
        </div>
      ) : null}

      {/* ----------- Top templates + recent failures ----------- */}
      {summary ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top templates</CardTitle>
              <CardDescription>By sent count in the selected range.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {summary.topTemplates.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  No templated sends in this range.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.topTemplates.map((t) => (
                      <TableRow key={t.templateName}>
                        <TableCell className="font-medium">
                          <span className="inline-flex items-center gap-2">
                            <FileText className="size-3.5 text-muted-foreground" />
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                              {t.templateName}
                            </code>
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{t.sent.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">
                          {t.failed.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{t.share}%</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent failures</CardTitle>
              <CardDescription>Last 10 failed sends in the selected range.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {summary.recentFailures.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">No failures — nice work.</p>
              ) : (
                <ul className="divide-y">
                  {summary.recentFailures.map((f) => (
                    <li key={f.id} className="flex items-start gap-3 px-6 py-3 text-sm">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            {f.channel}
                          </Badge>
                          {f.providerName ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {f.providerName}
                            </Badge>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {new Date(f.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {f.reason ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {f.reason}
                          </p>
                        ) : null}
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {f.toPhone ?? f.toEmail ?? "—"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ExportButton({
  filters,
  since,
  until,
}: {
  filters: {
    projectId?: string;
    environmentId?: string;
    channel?: string;
    sinceDays: number;
  };
  since?: string;
  until?: string;
}) {
  // Build the URL from the *same* filter shape the summary uses so the export
  // matches the screen exactly.
  const url = new URL("/analytics/export", typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (filters.projectId) url.searchParams.set("projectId", filters.projectId);
  if (filters.environmentId) url.searchParams.set("environmentId", filters.environmentId);
  if (filters.channel) url.searchParams.set("channel", filters.channel);
  if (since) url.searchParams.set("since", since);
  if (until) url.searchParams.set("until", until);

  return (
    <Button asChild variant="outline">
      <a href={url.pathname + url.search} download>
        <Download />
        Export CSV
      </a>
    </Button>
  );
}

function pctDelta(current: number, prior: number): number | null {
  if (prior === 0) {
    return current === 0 ? 0 : null;
  }
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

function formatBucketTick(bucket: string, size: "hour" | "day" | "week"): string {
  // "2025-01-12T10" or "2025-01-12"
  if (size === "hour") {
    const [day, hour] = bucket.split("T");
    return `${day.slice(5)} ${hour}:00`;
  }
  return bucket.slice(5); // strip "yyyy-" prefix to save horizontal space
}
