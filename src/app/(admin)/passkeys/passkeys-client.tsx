"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Fingerprint,
  Plus,
  Trash2,
  Shield,
  Smartphone,
  KeyRound,
  Globe,
  HardDrive,
} from "lucide-react";
import { authClient } from "@root/lib/auth-client";
import { Button } from "@root/components/ui/button";
import { Card, CardContent } from "@root/components/ui/card";
import { Badge } from "@root/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@root/components/ui/dialog";
import { Input } from "@root/components/ui/input";
import { Label } from "@root/components/ui/label";
import { Skeleton } from "@root/components/ui/skeleton";
import { cn } from "@root/lib/utils";

interface Passkey {
  id: string;
  name?: string | null;
  deviceType: string;
  backedUp: boolean;
  transports?: string | null;
  createdAt?: string | Date | null;
  credentialID?: string;
  aaguid?: string | null;
}

export function PasskeysClient() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const result = await authClient.passkey.listUserPasskeys();
      if (result.error) throw new Error(result.error.message ?? "Failed to load passkeys");
      return (result.data ?? []) as Passkey[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await authClient.passkey.deletePasskey({ id });
      if (result.error) throw new Error(result.error.message ?? "Delete failed");
    },
    onSuccess: () => {
      toast.success("Passkey removed");
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const passkeys = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="size-4" />
          {passkeys.length} passkey{passkeys.length === 1 ? "" : "s"} registered
        </div>
        <RegisterPasskeyDialog
          onRegistered={() => queryClient.invalidateQueries({ queryKey: ["passkeys"] })}
        />
      </div>

      {error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{error.message}</CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : passkeys.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3">
          {passkeys.map((p) => (
            <PasskeyCard
              key={p.id}
              passkey={p}
              onDelete={() => deleteMutation.mutate(p.id)}
              isDeleting={deleteMutation.isPending && deleteMutation.variables === p.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Fingerprint className="size-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">No passkeys yet</p>
          <p className="text-sm text-muted-foreground">
            Register your first passkey for one-touch, phishing-resistant sign-in.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function PasskeyCard({
  passkey,
  onDelete,
  isDeleting,
}: {
  passkey: Passkey;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const transports = passkey.transports
    ? (passkey.transports as string).split(",").filter(Boolean)
    : [];
  const isPlatform = passkey.deviceType === "singleDevice" || passkey.deviceType === "platform";

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {isPlatform ? (
              <Smartphone className="size-5" />
            ) : (
              <KeyRound className="size-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium">{passkey.name || "Unnamed passkey"}</p>
              <Badge variant={passkey.backedUp ? "success" : "outline"} className="text-[10px]">
                {passkey.backedUp ? "Synced" : "Device-bound"}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {passkey.deviceType}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Added{" "}
              {passkey.createdAt
                ? new Date(passkey.createdAt).toLocaleString()
                : "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Details
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Passkey details</DialogTitle>
                <DialogDescription>
                  Full WebAuthn credential metadata, as reported by your authenticator.
                </DialogDescription>
              </DialogHeader>
              <dl className="grid gap-2 text-sm">
                <DetailRow icon={Fingerprint} label="Name" value={passkey.name ?? "—"} />
                <DetailRow
                  icon={HardDrive}
                  label="Device type"
                  value={passkey.deviceType}
                />
                <DetailRow
                  icon={Shield}
                  label="Backed up"
                  value={passkey.backedUp ? "Yes (synced via cloud)" : "No (device-bound)"}
                />
                <DetailRow
                  icon={Globe}
                  label="Transports"
                  value={transports.length ? transports.join(", ") : "—"}
                />
                <DetailRow
                  icon={KeyRound}
                  label="Credential ID"
                  value={
                    <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">
                      {passkey.credentialID ?? "—"}
                    </code>
                  }
                />
                <DetailRow
                  icon={KeyRound}
                  label="AAGUID"
                  value={
                    <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">
                      {passkey.aaguid ?? "—"}
                    </code>
                  }
                />
                <DetailRow
                  icon={Plus}
                  label="Created"
                  value={
                    passkey.createdAt ? new Date(passkey.createdAt).toLocaleString() : "—"
                  }
                />
              </dl>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={isDeleting}
          >
            <Trash2 />
            {isDeleting ? "Removing…" : "Remove"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_8rem_1fr] items-baseline gap-2">
      <Icon className="size-3.5 text-muted-foreground" />
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function RegisterPasskeyDialog({ onRegistered }: { onRegistered: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function register() {
    setSubmitting(true);
    try {
      const result = await authClient.passkey.addPasskey({ name: name || undefined });
      if (result?.error) {
        toast.error(result.error.message ?? "Registration failed");
        return;
      }
      toast.success("Passkey registered");
      setName("");
      setOpen(false);
      onRegistered();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Registration failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Register passkey
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register a passkey</DialogTitle>
          <DialogDescription>
            Your browser will prompt you to create a credential on this device, on a phone
            via QR, or on a hardware security key.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="passkey-name">Label (optional)</Label>
            <Input
              id="passkey-name"
              placeholder="e.g. MacBook Touch ID"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className={cn("text-xs text-muted-foreground")}>
              Helps you identify this passkey later in the list.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={register} disabled={submitting}>
            {submitting ? "Waiting for authenticator…" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
