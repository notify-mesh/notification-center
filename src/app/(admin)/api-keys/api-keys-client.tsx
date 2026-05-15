"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  KeyRound,
  MoreHorizontal,
  Copy,
  RotateCw,
  Ban,
  ShieldCheck,
  Globe,
  Gauge,
  Calendar,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@root/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@root/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@root/components/ui/dialog";
import { Input } from "@root/components/ui/input";
import { Label } from "@root/components/ui/label";
import { Skeleton } from "@root/components/ui/skeleton";

interface ApiKey {
  id: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  isActive: boolean;
  expiresAt: string | null;
  deprecatedAt: string | null;
  revokedAt: string | null;
  projectId: string;
  environmentId: string;
  teamId: string | null;
  canRead: boolean;
  canWrite: boolean;
  scopes: string[];
  ipRestrictions: string[];
  countryRestrictions: string[];
  websiteOrigins: string[];
  allowedMethods: string[];
  requireHttps: boolean;
  rateLimitPerSecond: number | null;
  dailyQuota: number | null;
  monthlyQuota: number | null;
  createdAt: string;
}

export function ApiKeysClient() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await client.apiKeys.list({ includeRevoked: false });
      return res.keys as ApiKey[];
    },
  });

  const rotateMutation = useMutation({
    mutationFn: async (keyId: string) =>
      client.apiKeys.rotate({ keyId, gracePeriodHours: 24 }),
    onSuccess: (result) => {
      toast.success("Rotated. Copy the new token now — it won't be shown again.");
      setRotatedToken(result.token);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async ({ keyId, reason }: { keyId: string; reason?: string }) =>
      client.apiKeys.revoke({ keyId, reason }),
    onSuccess: () => {
      toast.success("Key revoked");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [rotatedToken, setRotatedToken] = React.useState<string | null>(null);

  const keys = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {keys.length} active key{keys.length === 1 ? "" : "s"}
        </span>
      </div>

      {error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{error.message}</CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : keys.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <KeyRound className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No API keys yet</p>
              <p className="text-sm text-muted-foreground">
                Issue a key to allow services to send notifications.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Active keys</CardTitle>
            <CardDescription>Click a row to inspect restrictions.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Limits</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <ApiKeyRow
                    key={key.id}
                    apiKey={key}
                    onRotate={() => rotateMutation.mutate(key.id)}
                    onRevoke={(reason) => revokeMutation.mutate({ keyId: key.id, reason })}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!rotatedToken} onOpenChange={(o) => !o && setRotatedToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your new key</DialogTitle>
            <DialogDescription>
              You can&apos;t see this token again. Store it in your secret manager before
              closing this dialog.
            </DialogDescription>
          </DialogHeader>
          {rotatedToken ? (
            <div className="flex flex-col gap-2">
              <Label>New token</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={rotatedToken} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(rotatedToken);
                    toast.success("Copied");
                  }}
                >
                  <Copy />
                </Button>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setRotatedToken(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApiKeyRow({
  apiKey,
  onRotate,
  onRevoke,
}: {
  apiKey: ApiKey;
  onRotate: () => void;
  onRevoke: (reason?: string) => void;
}) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const [revokeReason, setRevokeReason] = React.useState("");

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setDetailsOpen(true)}>
        <TableCell>
          <div className="flex flex-col">
            <span className="font-medium">{apiKey.name}</span>
            {apiKey.description ? (
              <span className="text-xs text-muted-foreground">{apiKey.description}</span>
            ) : null}
          </div>
        </TableCell>
        <TableCell>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {apiKey.keyPrefix}…
          </code>
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            {apiKey.canRead ? <Badge variant="outline">read</Badge> : null}
            {apiKey.canWrite ? <Badge variant="outline">write</Badge> : null}
            {apiKey.scopes.length > 0 ? (
              <Badge variant="secondary">+{apiKey.scopes.length} scope</Badge>
            ) : null}
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {apiKey.rateLimitPerSecond ? `${apiKey.rateLimitPerSecond}/s` : "—"}
          {apiKey.dailyQuota ? ` · ${apiKey.dailyQuota.toLocaleString()}/day` : ""}
        </TableCell>
        <TableCell>
          {apiKey.deprecatedAt ? (
            <Badge variant="warning">Deprecated</Badge>
          ) : apiKey.isActive ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="destructive">Revoked</Badge>
          )}
        </TableCell>
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDetailsOpen(true)}>
                Inspect
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRotate}>
                <RotateCw /> Rotate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setRevokeOpen(true)}
              >
                <Ban /> Revoke
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4" /> {apiKey.name}
            </DialogTitle>
            <DialogDescription>
              Full security restrictions for this key. Plaintext is never shown after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailSection icon={ShieldCheck} title="Permissions">
              <ListRow label="Read" value={apiKey.canRead ? "Yes" : "No"} />
              <ListRow label="Write" value={apiKey.canWrite ? "Yes" : "No"} />
              <ListRow
                label="Scopes"
                value={apiKey.scopes.length ? apiKey.scopes.join(", ") : "—"}
              />
              <ListRow label="HTTP methods" value={apiKey.allowedMethods.join(", ")} />
              <ListRow label="Require HTTPS" value={apiKey.requireHttps ? "Yes" : "No"} />
            </DetailSection>
            <DetailSection icon={Globe} title="Network">
              <ListRow
                label="IPs / CIDRs"
                value={apiKey.ipRestrictions.length ? apiKey.ipRestrictions.join(", ") : "Any"}
              />
              <ListRow
                label="Countries"
                value={
                  apiKey.countryRestrictions.length
                    ? apiKey.countryRestrictions.join(", ")
                    : "Any"
                }
              />
              <ListRow
                label="Origins"
                value={apiKey.websiteOrigins.length ? apiKey.websiteOrigins.join(", ") : "Any"}
              />
            </DetailSection>
            <DetailSection icon={Gauge} title="Quotas">
              <ListRow
                label="Rate limit"
                value={apiKey.rateLimitPerSecond ? `${apiKey.rateLimitPerSecond} / sec` : "—"}
              />
              <ListRow
                label="Daily quota"
                value={apiKey.dailyQuota ? apiKey.dailyQuota.toLocaleString() : "—"}
              />
              <ListRow
                label="Monthly quota"
                value={apiKey.monthlyQuota ? apiKey.monthlyQuota.toLocaleString() : "—"}
              />
            </DetailSection>
            <DetailSection icon={Calendar} title="Lifecycle">
              <ListRow label="Created" value={new Date(apiKey.createdAt).toLocaleString()} />
              <ListRow
                label="Expires"
                value={apiKey.expiresAt ? new Date(apiKey.expiresAt).toLocaleString() : "Never"}
              />
              <ListRow
                label="Deprecated"
                value={
                  apiKey.deprecatedAt ? new Date(apiKey.deprecatedAt).toLocaleString() : "—"
                }
              />
            </DetailSection>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke this API key?</DialogTitle>
            <DialogDescription>
              This is immediate and cannot be undone. Calls using this key will start
              returning 401 right away. Provide a short reason for audit.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="reason">Reason</Label>
            <Input
              id="reason"
              placeholder="Leaked in commit a1b2c3"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevokeOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setRevokeOpen(false);
                onRevoke(revokeReason || undefined);
              }}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Icon className="size-3.5 text-muted-foreground" />
        {title}
      </div>
      <dl className="space-y-1 text-sm">{children}</dl>
    </div>
  );
}

function ListRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm">{value}</dd>
    </div>
  );
}
