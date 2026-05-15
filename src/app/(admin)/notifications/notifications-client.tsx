"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  Globe,
  Inbox,
  Info,
  Mail,
  MessageSquarePlus,
  Send,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import { client } from "@root/lib/orpc/client";
import { Badge } from "@root/components/ui/badge";
import { Button } from "@root/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@root/components/ui/card";
import { Input } from "@root/components/ui/input";
import { Label } from "@root/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@root/components/ui/select";
import { Skeleton } from "@root/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@root/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@root/components/ui/avatar";
import { Switch } from "@root/components/ui/switch";
import { Checkbox } from "@root/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@root/components/ui/table";
import { MarkdownEditor } from "@root/components/ui/markdown-editor";
import { Markdown } from "@root/components/ui/markdown";
import { UserMultiSelect } from "@root/components/notify/user-multi-select";
import { KpiCard } from "@root/components/charts/kpi-card";
import { BarChartCard } from "@root/components/charts/bar-chart-card";
import { DonutChartCard } from "@root/components/charts/donut-chart-card";
import { cn } from "@root/lib/utils";
import { useInternalNotifyStream } from "@root/lib/internal-notify/use-stream";

type TabId = "inbox" | "compose" | "sent" | "analytics";
type AudienceKind = "GLOBAL" | "ORGANIZATION" | "PROJECT" | "TEAM" | "USERS";
type Severity = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
type Mirror = "email" | "sms";

export function NotificationsClient() {
  const [tab, setTab] = React.useState<TabId>("inbox");
  const [selectedSentId, setSelectedSentId] = React.useState<string | null>(null);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="gap-4">
      <TabsList>
        <TabsTrigger value="inbox">
          <Inbox className="size-3.5" /> Inbox
        </TabsTrigger>
        <TabsTrigger value="compose">
          <MessageSquarePlus className="size-3.5" /> Compose
        </TabsTrigger>
        <TabsTrigger value="sent">
          <Send className="size-3.5" /> Sent
        </TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
      </TabsList>

      <TabsContent value="inbox" className="mt-0">
        <InboxPanel />
      </TabsContent>
      <TabsContent value="compose" className="mt-0">
        <ComposePanel
          onSent={(id) => {
            setSelectedSentId(id);
            setTab("analytics");
          }}
        />
      </TabsContent>
      <TabsContent value="sent" className="mt-0">
        <SentPanel
          onOpenAnalytics={(id) => {
            setSelectedSentId(id);
            setTab("analytics");
          }}
        />
      </TabsContent>
      <TabsContent value="analytics" className="mt-0">
        {selectedSentId ? (
          <AnalyticsPanel
            notificationId={selectedSentId}
            onBack={() => setTab("sent")}
          />
        ) : (
          <AnalyticsPickerPanel onPick={setSelectedSentId} />
        )}
      </TabsContent>
    </Tabs>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Inbox
// ───────────────────────────────────────────────────────────────────────

function InboxPanel() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = React.useState<"all" | "unread" | "read">("all");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());

  const inboxQuery = useQuery({
    queryKey: ["internal-notify", "inbox", filter],
    queryFn: async () => client.internalNotify.inbox({ filter, limit: 50 }),
    refetchOnWindowFocus: true,
  });

  // Live-update via SSE.
  useInternalNotifyStream(
    React.useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["internal-notify", "inbox"] });
      queryClient.invalidateQueries({ queryKey: ["internal-notify", "unread-count"] });
    }, [queryClient]),
  );

  function invalidateInbox() {
    queryClient.invalidateQueries({ queryKey: ["internal-notify", "inbox"] });
    queryClient.invalidateQueries({ queryKey: ["internal-notify", "unread-count"] });
  }

  const markRead = useMutation({
    mutationFn: async (id: string) => client.internalNotify.markRead({ id }),
    onSuccess: invalidateInbox,
    onError: (e: Error) => toast.error(e.message),
  });
  const markManyMutation = useMutation({
    mutationFn: async (ids: string[]) => client.internalNotify.markManyRead({ ids }),
    onSuccess: (r) => {
      toast.success(`Marked ${r.updatedCount} as read`);
      setSelected(new Set());
      invalidateInbox();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const markAll = useMutation({
    mutationFn: async () => client.internalNotify.markAllRead({}),
    onSuccess: (r) => {
      toast.success(`Marked ${r.updatedCount} as read`);
      setSelected(new Set());
      invalidateInbox();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const dismissOne = useMutation({
    mutationFn: async (id: string) => client.internalNotify.dismiss({ id }),
    onSuccess: invalidateInbox,
    onError: (e: Error) => toast.error(e.message),
  });
  const dismissManyMutation = useMutation({
    mutationFn: async (ids: string[]) => client.internalNotify.dismissMany({ ids }),
    onSuccess: (r) => {
      toast.success(`Dismissed ${r.updatedCount}`);
      setSelected(new Set());
      invalidateInbox();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = inboxQuery.data?.items ?? [];

  // Visible selection only — drop ids that left the list (filter change,
  // dismissal, etc.) so the bulk bar count is always honest.
  const visibleIds = React.useMemo(() => new Set(items.map((n) => n.id)), [items]);
  const effectiveSelected = React.useMemo(() => {
    const filtered = new Set<string>();
    selected.forEach((id) => {
      if (visibleIds.has(id)) filtered.add(id);
    });
    return filtered;
  }, [selected, visibleIds]);

  const selectableUnread = items.filter((n) => n.readAt === null);
  const allVisibleSelected =
    items.length > 0 && items.every((n) => effectiveSelected.has(n.id));
  const someSelected = effectiveSelected.size > 0;

  function toggleOne(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleAll(on: boolean) {
    setSelected(on ? new Set(items.map((n) => n.id)) : new Set());
  }

  function bulkMarkRead() {
    const ids = [...effectiveSelected].filter((id) =>
      selectableUnread.some((n) => n.id === id),
    );
    if (ids.length === 0) {
      toast.message("Selection is already read");
      return;
    }
    markManyMutation.mutate(ids);
  }
  function bulkDismiss() {
    if (effectiveSelected.size === 0) return;
    dismissManyMutation.mutate([...effectiveSelected]);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6 pb-6">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "unread" | "read")}>
            <TabsList>
              <TabsTrigger value="all">
                All <Badge variant="secondary" className="ml-2 text-[10px]">
                  {items.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="unread">
                Unread <Badge variant="default" className="ml-2 text-[10px]">
                  {inboxQuery.data?.unreadCount ?? 0}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="read">Read</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending || (inboxQuery.data?.unreadCount ?? 0) === 0}
            className="ml-auto"
          >
            <CheckCheck className="size-3.5" /> Mark all read
          </Button>
        </CardContent>
      </Card>

      {/* Sticky bulk-action bar */}
      {items.length > 0 ? (
        <div
          className={cn(
            "sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-2 shadow-sm transition",
            someSelected ? "border-primary/40 bg-primary/[0.03]" : "",
          )}
        >
          <label className="flex items-center gap-2 px-2 text-sm">
            <Checkbox
              checked={allVisibleSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={(c) => toggleAll(c === true)}
              aria-label={allVisibleSelected ? "Deselect all" : "Select all"}
            />
            <span className="text-muted-foreground">
              {someSelected
                ? `${effectiveSelected.size} selected`
                : `Select notifications`}
            </span>
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!someSelected || markManyMutation.isPending}
              onClick={bulkMarkRead}
            >
              <CheckCheck className="size-3.5" />
              {markManyMutation.isPending
                ? "Marking…"
                : `Mark ${effectiveSelected.size || ""} as read`}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!someSelected || dismissManyMutation.isPending}
              onClick={bulkDismiss}
            >
              <X className="size-3.5" /> Dismiss
            </Button>
            {someSelected ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {inboxQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Inbox empty"
          body={
            filter === "unread"
              ? "You're all caught up. Switch the filter to All to see read notifications."
              : "Nobody has sent you anything yet."
          }
        />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <InboxRow
              key={n.recipientId}
              item={n}
              selected={effectiveSelected.has(n.id)}
              onSelectChange={(on) => toggleOne(n.id, on)}
              onRead={() => markRead.mutate(n.id)}
              onDismiss={() => dismissOne.mutate(n.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxRow({
  item,
  selected,
  onSelectChange,
  onRead,
  onDismiss,
}: {
  item: {
    id: string;
    recipientId: string;
    title: string;
    body: string;
    severity: Severity;
    audienceLabel: string;
    audienceKind: AudienceKind;
    action: { label: string; url: string; kind: string } | null;
    sender: { id: string; name: string; email: string; image: string | null };
    sentAt: string;
    readAt: string | null;
  };
  selected: boolean;
  onSelectChange: (on: boolean) => void;
  onRead: () => void;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = React.useState(item.readAt === null);
  const unread = item.readAt === null;
  return (
    <li>
      <Card
        className={cn(
          "transition border",
          unread ? "border-primary/40 bg-primary/[0.02]" : "",
          selected ? "ring-1 ring-primary/60" : "",
        )}
      >
        <CardContent className="flex items-start gap-3 p-4">
          <Checkbox
            checked={selected}
            onCheckedChange={(c) => onSelectChange(c === true)}
            aria-label={selected ? "Deselect notification" : "Select notification"}
            className="mt-0.5"
          />
          <SeverityIcon severity={item.severity} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold leading-tight">{item.title}</h3>
              {unread ? <span className="inline-block size-2 rounded-full bg-primary" /> : null}
              <Badge variant="outline" className="ml-auto text-[10px]">
                <AudienceIcon kind={item.audienceKind} /> {item.audienceLabel}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Avatar className="size-4">
                {item.sender.image ? <AvatarImage src={item.sender.image} alt={item.sender.name} /> : null}
                <AvatarFallback className="text-[8px]">
                  {item.sender.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span>{item.sender.name}</span>
              <span>·</span>
              <span>{new Date(item.sentAt).toLocaleString()}</span>
            </div>
            {expanded ? (
              <div className="mt-2 max-h-72 overflow-auto rounded-md border bg-background p-3">
                <Markdown source={item.body} />
              </div>
            ) : (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {previewLine(item.body)}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Collapse" : "Read"}
              </Button>
              {item.action ? (
                <Button
                  size="sm"
                  variant={item.action.kind === "danger" ? "destructive" : item.action.kind === "primary" ? "default" : "outline"}
                  asChild
                  onClick={() => {
                    void client.internalNotify.click({ id: item.id }).catch(() => {});
                  }}
                >
                  <a href={item.action.url} target="_blank" rel="noreferrer">
                    {item.action.label}
                    <ExternalLink className="ml-1 size-3" />
                  </a>
                </Button>
              ) : null}
              {unread ? (
                <Button variant="ghost" size="sm" onClick={onRead}>
                  <CheckCheck className="size-3.5" /> Mark read
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                <X className="size-3.5" /> Dismiss
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function previewLine(md: string): string {
  return md.replace(/[#>*_`\-]/g, "").split("\n").find((l) => l.trim()) ?? "";
}

// ───────────────────────────────────────────────────────────────────────
// Compose
// ───────────────────────────────────────────────────────────────────────

function ComposePanel({ onSent }: { onSent: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [severity, setSeverity] = React.useState<Severity>("INFO");
  const [category, setCategory] = React.useState("");
  const [audienceKind, setAudienceKind] = React.useState<AudienceKind>("ORGANIZATION");
  const [pickedOrgId, setOrgId] = React.useState<string>("");
  const [projectId, setProjectId] = React.useState<string>("");
  const [teamId, setTeamId] = React.useState<string>("");
  const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([]);
  const [actionEnabled, setActionEnabled] = React.useState(false);
  const [actionLabel, setActionLabel] = React.useState("Open");
  const [actionUrl, setActionUrl] = React.useState("https://");
  const [mirrorEmail, setMirrorEmail] = React.useState(false);
  const [mirrorSms, setMirrorSms] = React.useState(false);
  const [mirrorProjectId, setMirrorProjectId] = React.useState("");
  const [mirrorEnvId, setMirrorEnvId] = React.useState("");

  const optionsQuery = useQuery({
    queryKey: ["internal-notify", "audience-options"],
    queryFn: async () => client.internalNotify.audienceOptions({}),
  });
  const mirrorOptionsQuery = useQuery({
    queryKey: ["api-keys", "options"],
    queryFn: async () => client.apiKeys.options({}),
    enabled: mirrorEmail || mirrorSms,
  });

  // Derived effective org id: pick the user's first org until they choose one.
  // Avoids the setState-in-effect pattern lint correctly flags.
  const orgId = pickedOrgId || optionsQuery.data?.organizations[0]?.id || "";

  const target = React.useMemo<
    | { kind: "GLOBAL" }
    | { kind: "ORGANIZATION"; organizationId: string }
    | { kind: "PROJECT"; projectId: string }
    | { kind: "TEAM"; teamId: string }
    | { kind: "USERS"; userIds: string[] }
    | null
  >(() => {
    switch (audienceKind) {
      case "GLOBAL":
        return { kind: "GLOBAL" };
      case "ORGANIZATION":
        return orgId ? { kind: "ORGANIZATION", organizationId: orgId } : null;
      case "PROJECT":
        return projectId ? { kind: "PROJECT", projectId } : null;
      case "TEAM":
        return teamId ? { kind: "TEAM", teamId } : null;
      case "USERS": {
        return selectedUserIds.length > 0
          ? { kind: "USERS", userIds: selectedUserIds }
          : null;
      }
    }
  }, [audienceKind, orgId, projectId, teamId, selectedUserIds]);

  const previewQuery = useQuery({
    queryKey: ["internal-notify", "audience-preview", target],
    enabled: !!target,
    queryFn: async () => {
      if (!target) throw new Error("no target");
      return client.internalNotify.audiencePreview({ target });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Select an audience first.");
      const mirrorChannels: Mirror[] = [
        ...(mirrorEmail ? (["email"] as Mirror[]) : []),
        ...(mirrorSms ? (["sms"] as Mirror[]) : []),
      ];
      return client.internalNotify.send({
        title,
        body,
        severity,
        category: category || undefined,
        action: actionEnabled
          ? { label: actionLabel, url: actionUrl, kind: "link" }
          : null,
        target,
        mirrorChannels,
        mirrorProjectId: mirrorChannels.length > 0 ? mirrorProjectId : undefined,
        mirrorEnvironmentId: mirrorChannels.length > 0 ? mirrorEnvId : undefined,
      });
    },
    onSuccess: (res) => {
      toast.success(`Sent to ${res.recipientCount} recipient${res.recipientCount === 1 ? "" : "s"}`);
      queryClient.invalidateQueries({ queryKey: ["internal-notify", "outbox"] });
      // Reset form
      setTitle("");
      setBody("");
      setActionEnabled(false);
      setCategory("");
      setSelectedUserIds([]);
      onSent(res.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const audienceCount = previewQuery.data?.count ?? 0;
  const audienceDenied = previewQuery.data?.denied ?? null;
  const canSend = Boolean(
    title &&
      body &&
      target &&
      !audienceDenied &&
      audienceCount > 0 &&
      (!mirrorEmail && !mirrorSms ? true : mirrorProjectId && mirrorEnvId),
  );
  const opts = optionsQuery.data;
  const mirrorOpts = mirrorOptionsQuery.data;
  const mirrorProject = mirrorOpts?.projects.find((p) => p.id === mirrorProjectId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Message</CardTitle>
            <CardDescription>Title appears in the inbox; body supports markdown.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Heads-up: deploy window tomorrow at 10:00 IRST"
                maxLength={200}
              />
            </div>
            <div className="grid gap-2">
              <Label>Body</Label>
              <MarkdownEditor
                value={body}
                onChange={setBody}
                placeholder="Detailed body in markdown…"
                rows={10}
              />
              <p className="text-[11px] text-muted-foreground">
                Supports **bold**, _italics_, lists, [links](https://example.com), and inline `code`.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Severity</Label>
                <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INFO">Info</SelectItem>
                    <SelectItem value="SUCCESS">Success</SelectItem>
                    <SelectItem value="WARNING">Warning</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category (optional)</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="ops · announcement · release · …"
                  maxLength={60}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Call-to-action</CardTitle>
              <CardDescription>Optional button rendered on the inbox card.</CardDescription>
            </div>
            <Switch checked={actionEnabled} onCheckedChange={setActionEnabled} />
          </CardHeader>
          {actionEnabled ? (
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="action-label">Label</Label>
                <Input
                  id="action-label"
                  value={actionLabel}
                  onChange={(e) => setActionLabel(e.target.value)}
                  maxLength={60}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="action-url">URL</Label>
                <Input
                  id="action-url"
                  value={actionUrl}
                  onChange={(e) => setActionUrl(e.target.value)}
                />
              </div>
            </CardContent>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audience</CardTitle>
            <CardDescription>
              {opts?.isAdmin
                ? "Super-admin — you can target any audience including all users."
                : "You can target organizations, projects, teams, and users you share an organization with."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(
                [
                  { kind: "ORGANIZATION", label: "Organization", icon: Users },
                  { kind: "PROJECT", label: "Project", icon: Users },
                  { kind: "TEAM", label: "Team", icon: Users },
                  { kind: "USERS", label: "Users", icon: Users },
                  ...(opts?.isAdmin
                    ? [{ kind: "GLOBAL" as const, label: "Global", icon: Globe }]
                    : []),
                ] as Array<{ kind: AudienceKind; label: string; icon: typeof Users }>
              ).map(({ kind, label, icon: Icon }) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setAudienceKind(kind)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition",
                    audienceKind === kind
                      ? "border-primary bg-primary/5 text-primary"
                      : "text-muted-foreground hover:border-primary/40",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
            {audienceKind === "ORGANIZATION" ? (
              <div className="grid gap-2">
                <Label>Organization</Label>
                <Select value={orgId} onValueChange={setOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick an organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {opts?.organizations.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name} · {o.memberCount} members
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {audienceKind === "PROJECT" ? (
              <div className="grid gap-2">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {opts?.projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {p.organizationName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {audienceKind === "TEAM" ? (
              <div className="grid gap-2">
                <Label>Team</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {opts?.teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} · {t.organizationName} · {t.memberCount} members
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {audienceKind === "USERS" ? (
              <div className="grid gap-2">
                <Label>Recipients</Label>
                <UserMultiSelect
                  value={selectedUserIds}
                  onChange={setSelectedUserIds}
                  maxSelected={500}
                  placeholder="Search by name, email, username, or phone…"
                />
                <p className="text-[11px] text-muted-foreground">
                  {opts?.isAdmin
                    ? "Super-admin — every active user is searchable."
                    : "You can pick anyone who shares an organization with you."}
                </p>
              </div>
            ) : null}
            {audienceKind === "GLOBAL" ? (
              <div className="rounded-lg border border-amber-300/40 bg-amber-50/40 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200">
                <ShieldAlert className="mr-1 inline size-3.5 align-text-bottom" />
                Global broadcast — every active user on the platform will receive this. Use sparingly.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mirror channels (optional)</CardTitle>
            <CardDescription>
              Also send the notification through email / SMS via the existing notify pipeline.
              Requires picking a project + environment that has those providers configured.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleRow
                icon={Mail}
                label="Email"
                description="Send a copy through the configured SMTP / Resend provider."
                checked={mirrorEmail}
                onChange={setMirrorEmail}
              />
              <ToggleRow
                icon={MessageSquarePlus}
                label="SMS"
                description="Send a copy via Kavenegar / ADP."
                checked={mirrorSms}
                onChange={setMirrorSms}
              />
            </div>
            {mirrorEmail || mirrorSms ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Mirror project</Label>
                  <Select value={mirrorProjectId} onValueChange={setMirrorProjectId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Projects you can issue keys against</SelectLabel>
                        {mirrorOpts?.projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Mirror environment</Label>
                  <Select
                    value={mirrorEnvId}
                    onValueChange={setMirrorEnvId}
                    disabled={!mirrorProject}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick an environment" />
                    </SelectTrigger>
                    <SelectContent>
                      {mirrorProject?.environments.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* ── Right rail: live preview + send ── */}
      <aside className="sticky top-4 flex h-fit flex-col gap-3 rounded-lg border bg-card p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Audience preview</p>
          {audienceDenied ? (
            <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              <AlertTriangle className="mr-1 inline size-3 align-text-bottom" />
              {audienceDenied}
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm font-medium">
                {previewQuery.data?.audienceLabel ?? "Pick an audience"}
              </p>
              <p className="text-xs text-muted-foreground">
                {previewQuery.isFetching
                  ? "Resolving…"
                  : `${audienceCount} recipient${audienceCount === 1 ? "" : "s"}`}
              </p>
              {previewQuery.data?.sample?.length ? (
                <div className="mt-2 flex -space-x-2">
                  {previewQuery.data.sample.slice(0, 6).map((u) => (
                    <Avatar key={u.id} className="size-6 border-2 border-background">
                      {u.image ? <AvatarImage src={u.image} alt={u.name} /> : null}
                      <AvatarFallback className="text-[8px]">
                        {u.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {audienceCount > 6 ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      +{audienceCount - 6}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Inbox preview</p>
          <div className="mt-2 flex items-start gap-2">
            <SeverityIcon severity={severity} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{title || "Title goes here"}</p>
              <div className="mt-1 max-h-32 overflow-auto text-xs">
                {body ? <Markdown source={body} inline={false} /> : (
                  <span className="text-muted-foreground">Body preview…</span>
                )}
              </div>
              {actionEnabled ? (
                <Badge variant="outline" className="mt-2 text-[10px]">
                  {actionLabel} →
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => sendMutation.mutate()}
          disabled={!canSend || sendMutation.isPending}
        >
          <Send className="size-3.5" />
          {sendMutation.isPending ? "Sending…" : `Send to ${audienceCount}`}
        </Button>
      </aside>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Sent / Outbox
// ───────────────────────────────────────────────────────────────────────

function SentPanel({ onOpenAnalytics }: { onOpenAnalytics: (id: string) => void }) {
  const outboxQuery = useQuery({
    queryKey: ["internal-notify", "outbox"],
    queryFn: async () => client.internalNotify.outbox({ limit: 30 }),
  });

  if (outboxQuery.isLoading) return <Skeleton className="h-64 w-full" />;
  const items = outboxQuery.data?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Send}
        title="No sent notifications yet"
        body="Switch to the Compose tab to send your first internal notification."
      />
    );
  }

  return (
    <Card>
      <CardContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Audience</TableHead>
              <TableHead className="text-right">Recipients</TableHead>
              <TableHead className="text-right">Read</TableHead>
              <TableHead className="text-right">Clicked</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((n) => {
              const readPct =
                n.recipientCount === 0 ? 0 : Math.round((n.readCount / n.recipientCount) * 100);
              return (
                <TableRow key={n.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <SeverityIcon severity={n.severity} small />
                      <span className="truncate">{n.title}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      <AudienceIcon kind={n.audienceKind} /> {n.audienceLabel}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{n.recipientCount}</TableCell>
                  <TableCell className="text-right">
                    <span className="tabular-nums">{n.readCount}</span>
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      {readPct}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{n.clickedCount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(n.sentAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenAnalytics(n.id)}
                    >
                      Analytics
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Analytics
// ───────────────────────────────────────────────────────────────────────

function AnalyticsPickerPanel({ onPick }: { onPick: (id: string) => void }) {
  const outboxQuery = useQuery({
    queryKey: ["internal-notify", "outbox"],
    queryFn: async () => client.internalNotify.outbox({ limit: 30 }),
  });

  if (outboxQuery.isLoading) return <Skeleton className="h-64 w-full" />;
  const items = outboxQuery.data?.items ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Send}
        title="Nothing to analyse yet"
        body="Send your first notification from the Compose tab. Once it's out, you'll be able to drill into delivery, read rates, and click-through right here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pick a sent notification to analyse</CardTitle>
          <CardDescription>
            Showing your latest sends. Click any row to see read rate, click-through, and
            recipient breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <ul className="divide-y">
            {items.map((n) => {
              const readPct =
                n.recipientCount === 0 ? 0 : Math.round((n.readCount / n.recipientCount) * 100);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onPick(n.id)}
                    className="flex w-full items-center gap-3 px-6 py-3 text-left transition hover:bg-muted/40"
                  >
                    <SeverityIcon severity={n.severity} small />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {n.audienceLabel} · {new Date(n.sentAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-medium tabular-nums">
                        {n.readCount} / {n.recipientCount} read
                      </p>
                      <Badge variant="secondary" className="mt-0.5 text-[10px]">
                        {readPct}%
                      </Badge>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function AnalyticsPanel({
  notificationId,
  onBack,
}: {
  notificationId: string;
  onBack: () => void;
}) {
  const analyticsQuery = useQuery({
    queryKey: ["internal-notify", "analytics", notificationId],
    queryFn: async () => client.internalNotify.analytics({ id: notificationId }),
    refetchInterval: 15_000, // live-ish auto-refresh
  });

  if (analyticsQuery.isLoading || !analyticsQuery.data) {
    return <Skeleton className="h-96 w-full" />;
  }
  const data = analyticsQuery.data;
  const n = data.notification;
  const t = data.totals;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-3.5" /> Back to Sent
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 pb-6">
          <div className="flex items-start gap-3">
            <SeverityIcon severity={n.severity} />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold leading-tight">{n.title}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">
                  <AudienceIcon kind={n.audienceKind} /> {n.audienceLabel}
                </Badge>
                <span>·</span>
                <span>Sent {new Date(n.sentAt).toLocaleString()}</span>
                {n.mirrorChannels.length > 0 ? (
                  <>
                    <span>·</span>
                    <span>Mirrored: {n.mirrorChannels.join(", ")}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <Markdown source={n.body} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Recipients" value={t.recipients.toLocaleString()} icon={Users} />
        <KpiCard
          label="Read"
          value={t.read.toLocaleString()}
          hint={`${t.readRatePct}% read rate`}
          icon={CheckCheck}
        />
        <KpiCard
          label="Unread"
          value={t.unread.toLocaleString()}
          hint={`${t.dismissed.toLocaleString()} dismissed`}
          icon={AlertCircle}
        />
        <KpiCard
          label="Clicked"
          value={t.clicked.toLocaleString()}
          hint={`${t.clickRatePct}% click-through`}
          icon={ExternalLink}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <BarChartCard
          title="Read over time"
          description="Reads bucketed by hour for the first 24h, then by day."
          data={data.readOverTime.map((r) => ({ name: r.bucket, reads: r.reads }))}
          xKey="name"
          series={[{ dataKey: "reads", label: "Reads", color: "var(--chart-1)" }]}
          className="lg:col-span-2"
        />
        <DonutChartCard
          title="Engagement mix"
          description="Where every recipient ended up"
          data={[
            { name: "Read", value: t.read, color: "var(--chart-1)" },
            { name: "Clicked", value: t.clicked, color: "var(--chart-2)" },
            { name: "Dismissed", value: t.dismissed, color: "var(--chart-4)" },
            { name: "Unread", value: t.unread, color: "var(--muted)" },
          ]}
          centerLabel={t.recipients.toLocaleString()}
          centerSub="recipients"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>Latest read / click / delivery events.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <RecipientList items={data.recentRecipients} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Still unread</CardTitle>
            <CardDescription>Up to 20 recipients who haven&apos;t opened it.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {data.unreadRecipients.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                Everyone has either read or dismissed it.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.unreadRecipients.map((u) => (
                    <TableRow key={u.userId}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RecipientList({
  items,
}: {
  items: Array<{
    userId: string;
    name: string;
    email: string;
    image: string | null;
    readAt: string | null;
    deliveredAt: string | null;
    clickedAt: string | null;
  }>;
}) {
  if (items.length === 0) {
    return <p className="px-6 pb-6 text-sm text-muted-foreground">No activity yet.</p>;
  }
  return (
    <ul className="divide-y">
      {items.map((r) => {
        const state = r.clickedAt
          ? { label: "Clicked", time: r.clickedAt, tone: "text-emerald-600" }
          : r.readAt
            ? { label: "Read", time: r.readAt, tone: "text-primary" }
            : r.deliveredAt
              ? { label: "Delivered", time: r.deliveredAt, tone: "text-muted-foreground" }
              : { label: "Pending", time: null, tone: "text-muted-foreground" };
        return (
          <li key={r.userId} className="flex items-center gap-3 px-6 py-3">
            <Avatar className="size-7">
              {r.image ? <AvatarImage src={r.image} alt={r.name} /> : null}
              <AvatarFallback className="text-[10px]">
                {r.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.name}</p>
              <p className="truncate text-xs text-muted-foreground">{r.email}</p>
            </div>
            <div className={cn("text-right text-xs", state.tone)}>
              <p className="font-medium">{state.label}</p>
              {state.time ? (
                <p className="text-[10px] text-muted-foreground">
                  {new Date(state.time).toLocaleString()}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Shared visual bits
// ───────────────────────────────────────────────────────────────────────

function ToggleRow({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: typeof Mail;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition",
        checked ? "border-primary bg-primary/5" : "hover:border-primary/40",
      )}
    >
      <Icon className="mt-0.5 size-4 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function SeverityIcon({ severity, small }: { severity: Severity; small?: boolean }) {
  const cls = small ? "size-3.5" : "size-4";
  switch (severity) {
    case "CRITICAL":
      return <AlertTriangle className={cn(cls, "text-destructive")} />;
    case "WARNING":
      return <AlertCircle className={cn(cls, "text-amber-500")} />;
    case "SUCCESS":
      return <CheckCircle2 className={cn(cls, "text-emerald-500")} />;
    default:
      return <Info className={cn(cls, "text-primary")} />;
  }
}

function AudienceIcon({ kind }: { kind: AudienceKind }) {
  if (kind === "GLOBAL") return <Globe className="mr-1 inline size-3" />;
  return <Users className="mr-1 inline size-3" />;
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Inbox;
  title: string;
  body: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <Icon className="size-10 text-muted-foreground" />
        <h3 className="text-base font-medium">{title}</h3>
        <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
