"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Clock,
  LogOut,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { authClient } from "@root/lib/auth-client";
import { Button } from "@root/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@root/components/ui/card";
import { Badge } from "@root/components/ui/badge";
import { Skeleton } from "@root/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@root/components/ui/dialog";

interface Session {
  id: string;
  token: string;
  userId: string;
  expiresAt: string | Date;
  createdAt: string | Date;
  updatedAt?: string | Date | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function parseUA(ua?: string | null) {
  if (!ua) return { os: "Unknown", browser: "Unknown", deviceType: "desktop" as const };
  const u = ua.toLowerCase();
  let os = "Unknown";
  if (u.includes("windows")) os = "Windows";
  else if (u.includes("mac os x") || u.includes("macintosh")) os = "macOS";
  else if (u.includes("iphone") || u.includes("ipad")) os = "iOS";
  else if (u.includes("android")) os = "Android";
  else if (u.includes("linux")) os = "Linux";

  let browser = "Unknown";
  if (u.includes("edg/")) browser = "Edge";
  else if (u.includes("chrome/") && !u.includes("edg/")) browser = "Chrome";
  else if (u.includes("firefox/")) browser = "Firefox";
  else if (u.includes("safari/") && !u.includes("chrome/")) browser = "Safari";

  const deviceType: "mobile" | "tablet" | "desktop" = /ipad|tablet/.test(u)
    ? "tablet"
    : /mobile|iphone|android/.test(u)
      ? "mobile"
      : "desktop";

  return { os, browser, deviceType };
}

export function DevicesClient() {
  const queryClient = useQueryClient();
  const [revokeOthersOpen, setRevokeOthersOpen] = React.useState(false);

  const sessionsQuery = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const res = await authClient.listSessions();
      if (res.error) throw new Error(res.error.message ?? "Failed to load");
      return (res.data ?? []) as Session[];
    },
  });

  const currentQuery = useQuery({
    queryKey: ["current-session"],
    queryFn: async () => {
      const res = await authClient.getSession();
      if (res.error) throw new Error(res.error.message ?? "Failed to load");
      return res.data;
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await authClient.revokeSession({ token });
      if (res.error) throw new Error(res.error.message ?? "Revoke failed");
    },
    onSuccess: () => {
      toast.success("Device revoked");
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeOthersMutation = useMutation({
    mutationFn: async () => {
      const res = await authClient.revokeOtherSessions();
      if (res.error) throw new Error(res.error.message ?? "Revoke failed");
    },
    onSuccess: () => {
      toast.success("Other devices revoked");
      setRevokeOthersOpen(false);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sessions = sessionsQuery.data ?? [];
  const currentSessionId = currentQuery.data?.session.id;
  const otherCount = sessions.filter((s) => s.id !== currentSessionId).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4" />
          {sessions.length} active session{sessions.length === 1 ? "" : "s"}
        </div>
        <Button
          variant="outline"
          onClick={() => setRevokeOthersOpen(true)}
          disabled={otherCount === 0}
        >
          <LogOut />
          Sign out of other devices ({otherCount})
        </Button>
      </div>

      {sessionsQuery.isLoading ? (
        <div className="grid gap-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No active sessions found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sessions.map((s) => (
            <DeviceCard
              key={s.id}
              session={s}
              isCurrent={s.id === currentSessionId}
              onRevoke={() => revokeMutation.mutate(s.token)}
              isRevoking={revokeMutation.isPending && revokeMutation.variables === s.token}
            />
          ))}
        </div>
      )}

      <Dialog open={revokeOthersOpen} onOpenChange={setRevokeOthersOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out of other devices?</DialogTitle>
            <DialogDescription>
              This will end {otherCount} session{otherCount === 1 ? "" : "s"}. The current
              device stays signed in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevokeOthersOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => revokeOthersMutation.mutate()}
              disabled={revokeOthersMutation.isPending}
            >
              {revokeOthersMutation.isPending ? "Signing out…" : "Sign out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeviceCard({
  session,
  isCurrent,
  onRevoke,
  isRevoking,
}: {
  session: Session;
  isCurrent: boolean;
  onRevoke: () => void;
  isRevoking: boolean;
}) {
  const ua = parseUA(session.userAgent);
  const Icon = ua.deviceType === "mobile" ? Smartphone : ua.deviceType === "tablet" ? Tablet : Monitor;

  return (
    <Card className={isCurrent ? "border-primary/40 bg-primary/5" : undefined}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {ua.browser} on {ua.os}
              {isCurrent ? <Badge variant="success">Current</Badge> : null}
            </CardTitle>
            <CardDescription className="capitalize">{ua.deviceType}</CardDescription>
          </div>
        </div>
        {!isCurrent ? (
          <Button variant="destructive" size="sm" onClick={onRevoke} disabled={isRevoking}>
            <Trash2 />
            {isRevoking ? "Revoking…" : "Revoke"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-2 pb-6 text-sm sm:grid-cols-3">
        <Detail icon={Globe} label="IP" value={session.ipAddress ?? "—"} />
        <Detail
          icon={Clock}
          label="Signed in"
          value={new Date(session.createdAt).toLocaleString()}
        />
        <Detail
          icon={Clock}
          label="Expires"
          value={new Date(session.expiresAt).toLocaleString()}
        />
        <div className="sm:col-span-3">
          <p className="text-xs text-muted-foreground">User agent</p>
          <p className="break-all text-xs">{session.userAgent ?? "—"}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-3.5 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm">{value}</p>
      </div>
    </div>
  );
}
