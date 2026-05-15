"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BarChart3,
  Box,
  Cog,
  Key,
  KeyRound,
  Plug,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { KpiCard } from "@root/components/charts/kpi-card";
import { AreaChartCard, Sparkline } from "@root/components/charts/area-chart-card";
import { DonutChartCard } from "@root/components/charts/donut-chart-card";
import { client } from "@root/lib/orpc/client";
import { Button } from "@root/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@root/components/ui/card";
import { Badge } from "@root/components/ui/badge";
import { Input } from "@root/components/ui/input";
import { Label } from "@root/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@root/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@root/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@root/components/ui/tabs";
import { Skeleton } from "@root/components/ui/skeleton";
import { Switch } from "@root/components/ui/switch";

const CHANNELS = ["sms", "email", "push", "bale", "telegram"] as const;

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => (await client.projects.get({ projectId })).project,
  });
  const envQuery = useQuery({
    queryKey: ["environments", projectId],
    queryFn: async () => (await client.environments.list({ projectId })).environments,
  });

  const envs = envQuery.data ?? [];
  const [pickedEnvId, setEnvId] = React.useState<string | null>(null);
  const envId =
    (pickedEnvId && envs.find((e) => e.id === pickedEnvId)?.id) ??
    envs.find((e) => e.isDefault)?.id ??
    envs[0]?.id ??
    null;

  if (!projectQuery.data) {
    return <Skeleton className="h-96 w-full" />;
  }
  const project = projectQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Box className="size-5 text-primary" /> {project.name}
          </CardTitle>
          <CardDescription>{project.description ?? `slug · ${project.slug}`}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 pb-6 sm:grid-cols-4">
          <Stat label="Envs" value={project.environmentCount} />
          <Stat label="API keys" value={project.apiKeyCount} />
          <Stat label="Retention" value={`${project.retentionDays}d`} />
          <Stat label="Region" value={project.dataRegion ?? "—"} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs text-muted-foreground">Environment</Label>
        <Select value={envId ?? undefined} onValueChange={setEnvId}>
          <SelectTrigger size="sm" className="w-56">
            <SelectValue placeholder="Pick" />
          </SelectTrigger>
          <SelectContent>
            {envs.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
                {e.isDefault ? " · default" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CreateEnvDialog
          projectId={projectId}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["environments", projectId] })}
        />
      </div>

      {envId ? (
        <Tabs defaultValue="analytics" className="gap-4">
          <TabsList>
            <TabsTrigger value="analytics">
              <BarChart3 className="size-3.5" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="channels">
              <Plug className="size-3.5" /> Channels
            </TabsTrigger>
            <TabsTrigger value="providers">
              <Key className="size-3.5" /> Providers
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Cog className="size-3.5" /> Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="mt-0">
            <AnalyticsTab projectId={projectId} envId={envId} />
          </TabsContent>
          <TabsContent value="channels" className="mt-0">
            <ChannelsTab projectId={projectId} envId={envId} />
          </TabsContent>
          <TabsContent value="providers" className="mt-0">
            <ProvidersTab projectId={projectId} envId={envId} />
          </TabsContent>
          <TabsContent value="settings" className="mt-0">
            {/* key forces a remount on env switch so the JSON buffer resets. */}
            <SettingsTab key={envId} projectId={projectId} envId={envId} />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// ---------- Channels tab ----------
function ChannelsTab({ projectId, envId }: { projectId: string; envId: string }) {
  const queryClient = useQueryClient();
  const channelsQuery = useQuery({
    queryKey: ["channels", projectId, envId],
    queryFn: async () => (await client.channels.list({ projectId, envId })).channels,
  });
  const providersQuery = useQuery({
    queryKey: ["env-providers", projectId, envId],
    queryFn: async () => (await client.providers.list({ projectId, envId })).credentials,
  });

  const toggle = useMutation({
    mutationFn: async (input: {
      channel: (typeof CHANNELS)[number];
      providerKey: string;
      isActive: boolean;
    }) => client.channels.upsert({ projectId, envId, ...input, config: {} }),
    onSuccess: () => {
      toast.success("Channel updated");
      queryClient.invalidateQueries({ queryKey: ["channels", projectId, envId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const channels = channelsQuery.data ?? [];
  const providers = providersQuery.data ?? [];
  const channelMap = new Map(channels.map((c) => [c.channel, c]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Active channels</CardTitle>
        <CardDescription>
          Pick a configured provider for each channel. Toggle off without losing config.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-6">
        {CHANNELS.map((channel) => {
          const enabled = channelMap.get(channel);
          const candidates = providers.filter(() => true); // future: filter by `spec.channels`
          return (
            <div key={channel} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium uppercase">{channel}</p>
                <p className="text-xs text-muted-foreground">
                  {enabled
                    ? `via ${enabled.providerKey}${enabled.isActive ? "" : " · disabled"}`
                    : "Not configured"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={enabled?.providerKey ?? undefined}
                  onValueChange={(v) =>
                    toggle.mutate({ channel, providerKey: v, isActive: enabled?.isActive ?? true })
                  }
                >
                  <SelectTrigger size="sm" className="w-48">
                    <SelectValue placeholder="Pick provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((p) => (
                      <SelectItem key={p.id} value={p.providerKey}>
                        {p.providerKey}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Switch
                  checked={enabled?.isActive ?? false}
                  disabled={!enabled}
                  onCheckedChange={(v) =>
                    enabled &&
                    toggle.mutate({
                      channel,
                      providerKey: enabled.providerKey,
                      isActive: v,
                    })
                  }
                  aria-label={`Toggle ${channel}`}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------- Providers tab ----------
function ProvidersTab({ projectId, envId }: { projectId: string; envId: string }) {
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({
    queryKey: ["providers-catalog"],
    queryFn: async () => (await client.providers.catalog({})).providers,
  });
  const credsQuery = useQuery({
    queryKey: ["env-providers", projectId, envId],
    queryFn: async () => (await client.providers.list({ projectId, envId })).credentials,
  });

  const test = useMutation({
    mutationFn: async (id: string) => client.providers.test({ credentialId: id }),
    onSuccess: (r, id) => {
      if (r.ok) toast.success("Provider healthy");
      else toast.error(r.message ?? "Test failed");
      queryClient.invalidateQueries({ queryKey: ["env-providers", projectId, envId] });
      void id;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => client.providers.remove({ credentialId: id }),
    onSuccess: () => {
      toast.success("Credential removed");
      queryClient.invalidateQueries({ queryKey: ["env-providers", projectId, envId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const credentials = credsQuery.data ?? [];
  const catalog = catalogQuery.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {credentials.length} credential{credentials.length === 1 ? "" : "s"} configured
        </span>
        <AddProviderDialog
          projectId={projectId}
          envId={envId}
          catalog={catalog}
          onSaved={() =>
            queryClient.invalidateQueries({ queryKey: ["env-providers", projectId, envId] })
          }
        />
      </div>
      {credentials.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <KeyRound className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No providers configured</p>
            <p className="text-xs text-muted-foreground">
              Add a provider to enable channels for this environment.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {credentials.map((c) => (
            <Card key={c.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{c.providerKey}</CardTitle>
                    <CardDescription>{c.label ?? "primary"}</CardDescription>
                  </div>
                  <Badge
                    variant={
                      c.status === "HEALTHY"
                        ? "success"
                        : c.status === "FAILING"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {c.status.toLowerCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pb-6">
                <dl className="grid gap-1 text-xs">
                  {Object.entries(c.fields).map(([name, value]) => (
                    <div key={name} className="grid grid-cols-[6rem_1fr] gap-2">
                      <dt className="text-muted-foreground">{name}</dt>
                      <dd className="truncate font-mono text-xs">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => test.mutate(c.id)}>
                    <ShieldCheck /> Test
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => remove.mutate(c.id)}>
                    <Trash2 /> Remove
                  </Button>
                </div>
                {c.lastError ? (
                  <p className="text-xs text-destructive">{c.lastError}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

type CatalogEntry = NonNullable<
  Awaited<ReturnType<typeof client.providers.catalog>>
>["providers"][number];

function AddProviderDialog({
  projectId,
  envId,
  catalog,
  onSaved,
}: {
  projectId: string;
  envId: string;
  catalog: CatalogEntry[];
  onSaved: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [providerKey, setProviderKey] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const spec = catalog.find((p) => p.key === providerKey);

  const save = useMutation({
    mutationFn: async () => {
      if (!providerKey) throw new Error("Pick a provider");
      return client.providers.upsert({
        projectId,
        envId,
        providerKey,
        values,
      });
    },
    onSuccess: () => {
      toast.success("Credential saved (encrypted)");
      setOpen(false);
      setProviderKey(null);
      setValues({});
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Add provider
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add provider credential</DialogTitle>
          <DialogDescription>
            Secret fields are encrypted at rest with per-row data keys; only the masked prefix
            is shown after saving.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label>Provider</Label>
            <Select value={providerKey ?? undefined} onValueChange={setProviderKey}>
              <SelectTrigger>
                <SelectValue placeholder="Pick" />
              </SelectTrigger>
              <SelectContent>
                {catalog.map((p) => (
                  <SelectItem key={p.key} value={p.key} disabled={!p.implemented}>
                    {p.displayName}
                    {p.implemented ? "" : " · coming soon"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {spec ? (
            <div className="flex flex-col gap-3">
              {spec.fields.map((f) => (
                <div key={f.name} className="flex flex-col gap-2">
                  <Label htmlFor={`f-${f.name}`}>
                    {f.name}
                    {f.required ? <span className="text-destructive"> *</span> : null}
                    {f.secret ? (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        secret
                      </Badge>
                    ) : null}
                  </Label>
                  <Input
                    id={`f-${f.name}`}
                    type={f.secret ? "password" : f.type === "number" ? "number" : "text"}
                    value={values[f.name] ?? ""}
                    onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                    placeholder={f.placeholder}
                  />
                  <p className="text-xs text-muted-foreground">{f.description}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !spec}>
            {save.isPending ? "Saving…" : "Save credential"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Settings tab ----------
function SettingsTab({ projectId, envId }: { projectId: string; envId: string }) {
  const queryClient = useQueryClient();
  const envQuery = useQuery({
    queryKey: ["environments", projectId],
    queryFn: async () => (await client.environments.list({ projectId })).environments,
  });
  const env = envQuery.data?.find((e) => e.id === envId);
  // Bake the JSON text from env.settings; remount the textarea on env switch
  // by keying off `envId` so the user-edited buffer doesn't bleed across envs.
  const initialJson = React.useMemo(
    () => (env ? JSON.stringify(env.settings, null, 2) : ""),
    [env],
  );
  const [settings, setSettings] = React.useState(initialJson);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = JSON.parse(settings || "{}") as Record<string, unknown>;
      return client.environments.updateSettings({ projectId, envId, settings: parsed });
    },
    onSuccess: () => {
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["environments", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Environment settings</CardTitle>
            <CardDescription>JSON merge — unknown keys are preserved.</CardDescription>
          </div>
          {env?.isDefault ? <Badge variant="success">Default</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-6">
        <textarea
          value={settings}
          onChange={(e) => setSettings(e.target.value)}
          className="min-h-64 rounded-lg border bg-muted/30 p-3 font-mono text-xs"
          spellCheck={false}
        />
        <div className="flex items-center justify-end gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateEnvDialog({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const create = useMutation({
    mutationFn: async () => client.environments.create({ projectId, name }),
    onSuccess: () => {
      toast.success("Environment created");
      setOpen(false);
      setName("");
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus />
          New environment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create environment</DialogTitle>
          <DialogDescription>
            Lowercase, dash-separated. Settings inherit project defaults — tweak after creation.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-2">
          <Label htmlFor="env-name">Name</Label>
          <Input
            id="env-name"
            pattern="[a-z0-9-]+"
            value={name}
            onChange={(e) =>
              setName(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]+/g, "-")
                  .replace(/^-+|-+$/g, ""),
              )
            }
            placeholder="staging"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Analytics tab ----------
function AnalyticsTab({ projectId, envId }: { projectId: string; envId: string }) {
  const [days, setDays] = React.useState<number>(7);
  const summaryQuery = useQuery({
    queryKey: ["analytics", "summary", { projectId, envId, days }],
    queryFn: async () =>
      client.analytics.summary({ projectId, environmentId: envId, sinceDays: days }),
  });
  const summary = summaryQuery.data;

  if (summaryQuery.isLoading || !summary) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Range</Label>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24h</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <a
            href={`/analytics/export?projectId=${projectId}&environmentId=${envId}&since=${summary.range.since}&until=${summary.range.until}`}
            download
          >
            <Trash2 className="rotate-90" />
            Export CSV
          </a>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Sent"
          value={summary.totals.sent}
          hint={`${summary.totals.deliveryRatePct}% delivery rate`}
          delta={summary.prior.sent === 0 ? null : Math.round(((summary.totals.sent - summary.prior.sent) / summary.prior.sent) * 1000) / 10}
          trail={<Sparkline data={summary.timeline} xKey="bucket" dataKey="sent" color="var(--chart-1)" />}
        />
        <KpiCard
          label="Failed"
          value={summary.totals.failed}
          hint={`${summary.totals.failureRatePct}% failure rate`}
          trail={<Sparkline data={summary.timeline} xKey="bucket" dataKey="failed" color="var(--destructive)" />}
        />
        <KpiCard
          label="Latency p95"
          value={`${summary.latency.p95} ms`}
          hint={`p50 ${summary.latency.p50}ms`}
        />
        <KpiCard
          label="Cost"
          value={summary.costIrr.total.toLocaleString()}
          hint="IRR"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AreaChartCard
          title="Send volume"
          description={`Bucketed by ${summary.range.bucket}`}
          data={summary.timeline}
          xKey="bucket"
          series={[
            { dataKey: "sent", label: "Sent", color: "var(--chart-1)" },
            { dataKey: "failed", label: "Failed", color: "var(--destructive)" },
          ]}
          className="lg:col-span-2"
          xTickFormatter={(s) => s.slice(5)}
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
    </div>
  );
}

