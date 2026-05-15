"use client";

import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Globe,
  Key,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserMinus,
  UserPlus,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@root/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@root/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@root/components/ui/sheet";
import { Skeleton } from "@root/components/ui/skeleton";
import { cn } from "@root/lib/utils";

type AuthEvent = NonNullable<
  Awaited<ReturnType<typeof client.audit.listAuthEvents>>
>["events"][number];

type AdminEvent = NonNullable<
  Awaited<ReturnType<typeof client.audit.listAdminEvents>>
>["events"][number];

const PAGE_SIZE = 50;
const ANY_VALUE = "__any__";

const OUTCOMES = ["SUCCESS", "FAILURE", "BLOCKED"] as const;
const SEVERITIES = ["INFO", "WARN", "CRITICAL"] as const;

const ACTION_LABELS: Record<string, string> = {
  SIGN_IN: "Sign in",
  SIGN_OUT: "Sign out",
  SIGN_UP: "Sign up",
  PASSWORD_CHANGE: "Password change",
  PASSWORD_RESET_REQUEST: "Password reset requested",
  PASSWORD_RESET_COMPLETE: "Password reset completed",
  EMAIL_VERIFY_REQUEST: "Email verification sent",
  EMAIL_VERIFY_COMPLETE: "Email verified",
  PHONE_VERIFY_REQUEST: "Phone verification sent",
  PHONE_VERIFY_COMPLETE: "Phone verified",
  TWO_FACTOR_ENABLE: "2FA enabled",
  TWO_FACTOR_DISABLE: "2FA disabled",
  TWO_FACTOR_CHALLENGE: "2FA challenge",
  TWO_FACTOR_VERIFY: "2FA verified",
  BACKUP_CODE_USED: "Backup code used",
  PASSKEY_REGISTER: "Passkey registered",
  PASSKEY_REMOVE: "Passkey removed",
  PASSKEY_AUTHENTICATE: "Signed in with passkey",
  SESSION_CREATE: "Session created",
  SESSION_REFRESH: "Session refreshed",
  SESSION_REVOKE: "Session revoked",
  SESSION_REVOKE_ALL: "All sessions revoked",
  DEVICE_TRUST: "Device trusted",
  DEVICE_UNTRUST: "Device untrusted",
  DEVICE_REVOKE: "Device revoked",
  IMPERSONATION_START: "Impersonation started",
  IMPERSONATION_END: "Impersonation ended",
  ACCOUNT_BAN: "Account banned",
  ACCOUNT_UNBAN: "Account unbanned",
  ACCOUNT_DELETE: "Account deleted",
  ROLE_CHANGE: "Role changed",
  ORG_JOIN: "Joined organization",
  ORG_LEAVE: "Left organization",
  ORG_INVITE_ACCEPT: "Invitation accepted",
  ORG_INVITE_DECLINE: "Invitation declined",
  DEVICE_AUTH_REQUEST: "Device auth requested",
  DEVICE_AUTH_APPROVE: "Device auth approved",
  DEVICE_AUTH_REJECT: "Device auth rejected",
  COMPROMISED_PASSWORD_DETECTED: "Compromised password detected",
  RATE_LIMITED: "Rate-limited",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ").toLowerCase();
}

function actionIcon(action: string): LucideIcon {
  if (action.startsWith("PASSKEY")) return Key;
  if (action.startsWith("SIGN_IN")) return LogIn;
  if (action.startsWith("SIGN_OUT") || action.startsWith("SESSION")) return LogOut;
  if (action.startsWith("PASSWORD")) return Lock;
  if (action.startsWith("TWO_FACTOR") || action.startsWith("BACKUP_CODE")) return ShieldCheck;
  if (action.startsWith("DEVICE")) return Smartphone;
  if (action.startsWith("ORG")) return UserPlus;
  if (action.startsWith("ACCOUNT_BAN") || action.startsWith("ACCOUNT_DELETE")) return UserMinus;
  if (action === "RATE_LIMITED") return AlertTriangle;
  if (action === "COMPROMISED_PASSWORD_DETECTED") return ShieldAlert;
  return ActivityIcon;
}

function outcomeStyle(outcome: string) {
  switch (outcome) {
    case "SUCCESS":
      return { icon: CheckCircle2, variant: "success" as const };
    case "FAILURE":
      return { icon: XCircle, variant: "destructive" as const };
    case "BLOCKED":
      return { icon: ShieldAlert, variant: "warning" as const };
    default:
      return { icon: ActivityIcon, variant: "secondary" as const };
  }
}

function severityVariant(s: string) {
  switch (s) {
    case "CRITICAL":
      return "destructive" as const;
    case "WARN":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

export function ActivityClient() {
  const [tab, setTab] = React.useState<"auth" | "admin">("auth");
  const [outcome, setOutcome] = React.useState<string>(ANY_VALUE);
  const [severity, setSeverity] = React.useState<string>(ANY_VALUE);
  const [selected, setSelected] = React.useState<AuthEvent | AdminEvent | null>(null);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "auth" | "admin")} className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="auth">
            <Shield className="size-4" /> Auth events
          </TabsTrigger>
          <TabsTrigger value="admin">
            <Wrench className="size-4" /> Admin actions
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          <Filter className="size-3.5 text-muted-foreground" />
          {tab === "auth" ? (
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger size="sm" className="w-44">
                <SelectValue placeholder="All outcomes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_VALUE}>All outcomes</SelectItem>
                {OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o.toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger size="sm" className="w-44">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_VALUE}>All severities</SelectItem>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <TabsContent value="auth" className="mt-0">
        <AuthFeed
          outcome={outcome === ANY_VALUE ? undefined : (outcome as (typeof OUTCOMES)[number])}
          onSelect={setSelected}
        />
      </TabsContent>
      <TabsContent value="admin" className="mt-0">
        <AdminFeed
          severity={
            severity === ANY_VALUE ? undefined : (severity as (typeof SEVERITIES)[number])
          }
          onSelect={setSelected}
        />
      </TabsContent>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{selected ? "Event details" : ""}</SheetTitle>
            <SheetDescription>
              Raw audit record. The before/after diff (when present) is rendered as JSON.
            </SheetDescription>
          </SheetHeader>
          {selected ? <EventDetails event={selected} /> : null}
        </SheetContent>
      </Sheet>
    </Tabs>
  );
}

function AuthFeed({
  outcome,
  onSelect,
}: {
  outcome?: (typeof OUTCOMES)[number];
  onSelect: (e: AuthEvent) => void;
}) {
  const query = useInfiniteQuery({
    queryKey: ["audit", "auth", outcome ?? "all"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      client.audit.listAuthEvents({ limit: PAGE_SIZE, cursor: pageParam, outcome }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const events = query.data?.pages.flatMap((p) => p.events) ?? [];

  if (query.isLoading) return <FeedSkeleton />;
  if (events.length === 0) return <EmptyFeed kind="auth" />;

  return (
    <Card className="overflow-hidden">
      <ol className="divide-y">
        {events.map((event) => {
          const Icon = actionIcon(event.action);
          const style = outcomeStyle(event.outcome);
          const OutcomeIcon = style.icon;
          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onSelect(event)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <div
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                    style.variant === "success" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
                    style.variant === "destructive" && "bg-destructive/10 text-destructive",
                    style.variant === "warning" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                    style.variant === "secondary" && "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{actionLabel(event.action)}</p>
                    <Badge variant={style.variant} className="text-[10px]">
                      <OutcomeIcon className="size-3" />
                      {event.outcome.toLowerCase()}
                    </Badge>
                    {event.method ? (
                      <Badge variant="outline" className="text-[10px]">
                        {event.method}
                      </Badge>
                    ) : null}
                    {(event.riskScore ?? 0) >= 60 ? (
                      <Badge variant="destructive" className="text-[10px]">
                        risk {event.riskScore}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {event.identifier ? <span>{event.identifier}</span> : null}
                    {event.ipAddress ? (
                      <span className="inline-flex items-center gap-1">
                        <Globe className="size-3" />
                        {event.ipAddress}
                      </span>
                    ) : null}
                    {event.country ? (
                      <span>
                        {[event.city, event.region, event.country].filter(Boolean).join(", ")}
                      </span>
                    ) : null}
                    <span>{new Date(event.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
      <LoadMore
        hasNext={query.hasNextPage ?? false}
        isFetching={query.isFetchingNextPage}
        onClick={() => query.fetchNextPage()}
      />
    </Card>
  );
}

function AdminFeed({
  severity,
  onSelect,
}: {
  severity?: (typeof SEVERITIES)[number];
  onSelect: (e: AdminEvent) => void;
}) {
  const query = useInfiniteQuery({
    queryKey: ["audit", "admin", severity ?? "all"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      client.audit.listAdminEvents({ limit: PAGE_SIZE, cursor: pageParam, severity }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const events = query.data?.pages.flatMap((p) => p.events) ?? [];
  const error = query.error;

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Admin audit unavailable</CardTitle>
          <CardDescription>
            Only platform admins can view the admin-action feed.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (query.isLoading) return <FeedSkeleton />;
  if (events.length === 0) return <EmptyFeed kind="admin" />;

  return (
    <Card className="overflow-hidden">
      <ol className="divide-y">
        {events.map((event) => (
          <li key={event.id}>
            <button
              type="button"
              onClick={() => onSelect(event)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Wrench className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{event.action}</p>
                  <Badge variant={severityVariant(event.severity)} className="text-[10px]">
                    {event.severity.toLowerCase()}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {event.targetType}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>by {event.actorEmail ?? event.actorUserId.slice(0, 12)}</span>
                  <span>
                    {event.targetLabel ?? event.targetId.slice(0, 12)}
                  </span>
                  {event.ipAddress ? (
                    <span className="inline-flex items-center gap-1">
                      <Globe className="size-3" />
                      {event.ipAddress}
                    </span>
                  ) : null}
                  <span>{new Date(event.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ol>
      <LoadMore
        hasNext={query.hasNextPage ?? false}
        isFetching={query.isFetchingNextPage}
        onClick={() => query.fetchNextPage()}
      />
    </Card>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

function EmptyFeed({ kind }: { kind: "auth" | "admin" }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <ActivityIcon className="size-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">No events yet</p>
          <p className="text-sm text-muted-foreground">
            {kind === "auth"
              ? "Sign-ins and other identity events will appear here."
              : "Operator actions (creates, rotates, revokes…) will appear here."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadMore({
  hasNext,
  isFetching,
  onClick,
}: {
  hasNext: boolean;
  isFetching: boolean;
  onClick: () => void;
}) {
  if (!hasNext) return null;
  return (
    <div className="border-t p-3 text-center">
      <Button variant="ghost" size="sm" onClick={onClick} disabled={isFetching}>
        <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
        {isFetching ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}

function EventDetails({ event }: { event: AuthEvent | AdminEvent }) {
  const isAuth = "outcome" in event;
  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <dl className="grid gap-2 text-sm">
        <KV k="When" v={new Date(event.createdAt).toLocaleString()} />
        <KV k="Action" v={isAuth ? actionLabel(event.action) : event.action} />
        {isAuth ? (
          <>
            <KV k="Outcome" v={event.outcome} />
            {event.identifier ? <KV k="Identifier" v={event.identifier} /> : null}
            {event.method ? <KV k="Method" v={event.method} /> : null}
            {event.userId ? <KV k="User" v={event.userId} /> : null}
            {event.sessionId ? <KV k="Session" v={event.sessionId} /> : null}
            {event.ipAddress ? <KV k="IP" v={event.ipAddress} /> : null}
            {event.country ? (
              <KV
                k="Location"
                v={[event.city, event.region, event.country].filter(Boolean).join(", ")}
              />
            ) : null}
            {event.userAgent ? <KV k="User agent" v={event.userAgent} mono /> : null}
            {event.riskScore !== null ? <KV k="Risk score" v={String(event.riskScore)} /> : null}
            {event.riskFactors.length > 0 ? (
              <KV k="Risk factors" v={event.riskFactors.join(", ")} />
            ) : null}
            {event.reason ? <KV k="Reason" v={event.reason} /> : null}
          </>
        ) : (
          <>
            <KV k="Severity" v={event.severity} />
            <KV k="Target" v={`${event.targetType} · ${event.targetLabel ?? event.targetId}`} />
            {event.actorEmail ? <KV k="Actor" v={event.actorEmail} /> : null}
            {event.organizationId ? <KV k="Organization" v={event.organizationId} /> : null}
            {event.projectId ? <KV k="Project" v={event.projectId} /> : null}
            {event.environmentId ? <KV k="Environment" v={event.environmentId} /> : null}
            {event.ipAddress ? <KV k="IP" v={event.ipAddress} /> : null}
            {event.userAgent ? <KV k="User agent" v={event.userAgent} mono /> : null}
            {event.reason ? <KV k="Reason" v={event.reason} /> : null}
            {event.correlationId ? <KV k="Correlation" v={event.correlationId} mono /> : null}
          </>
        )}
      </dl>

      {!isAuth && (event.before || event.after) ? (
        <div className="grid gap-3">
          <Diff title="Before" payload={event.before} />
          <Diff title="After" payload={event.after} />
        </div>
      ) : null}

      {isAuth && event.metadata ? (
        <Diff title="Metadata" payload={event.metadata} />
      ) : null}
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className={cn("text-sm", mono && "break-all font-mono text-xs")}>{v}</dd>
    </div>
  );
}

function Diff({
  title,
  payload,
}: {
  title: string;
  payload: Record<string, unknown> | null;
}) {
  if (!payload) return null;
  return (
    <div className="rounded-lg border">
      <div className="border-b bg-muted/50 px-3 py-2 text-xs font-medium">{title}</div>
      <pre className="max-h-80 overflow-auto p-3 text-xs leading-relaxed">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
}
