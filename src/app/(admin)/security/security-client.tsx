"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  LogOut,
  XCircle,
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
import { Input } from "@root/components/ui/input";
import { Label } from "@root/components/ui/label";
import { Badge } from "@root/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@root/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@root/components/ui/tabs";
import { QrCode } from "@root/components/ui/qr-code";

interface RecentEvent {
  id: string;
  action: string;
  outcome: string;
  method: string | null;
  ipAddress: string | null;
  createdAt: string;
}

type SecurityTab = "password" | "2fa" | "activity" | "danger";

export function SecurityClient({
  initialTwoFactorEnabled,
  recentEvents,
}: {
  initialTwoFactorEnabled: boolean;
  recentEvents: RecentEvent[];
}) {
  const [tab, setTab] = React.useState<SecurityTab>("password");
  const [twoFactorEnabled, setTwoFactorEnabled] = React.useState(initialTwoFactorEnabled);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as SecurityTab)} className="gap-4">
      <TabsList>
        <TabsTrigger value="password">
          <KeyRound className="size-3.5" /> Password
        </TabsTrigger>
        <TabsTrigger value="2fa">
          <ShieldCheck className="size-3.5" /> Two-factor
        </TabsTrigger>
        <TabsTrigger value="activity">Recent activity</TabsTrigger>
        <TabsTrigger value="danger">Danger zone</TabsTrigger>
      </TabsList>

      <TabsContent value="password" className="mt-0">
        <ChangePasswordCard />
      </TabsContent>
      <TabsContent value="2fa" className="mt-0">
        <TwoFactorCard
          enabled={twoFactorEnabled}
          onChange={setTwoFactorEnabled}
        />
      </TabsContent>
      <TabsContent value="activity" className="mt-0">
        <RecentActivityCard events={recentEvents} />
      </TabsContent>
      <TabsContent value="danger" className="mt-0">
        <DangerZoneCard />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
function ChangePasswordCard() {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [revokeOther, setRevokeOther] = React.useState(true);
  const [showCurrent, setShowCurrent] = React.useState(false);
  const [showNext, setShowNext] = React.useState(false);

  const strength = passwordStrength(next);

  const mutation = useMutation({
    mutationFn: async () => {
      if (next !== confirm) throw new Error("Passwords don't match.");
      if (next.length < 8) throw new Error("Use at least 8 characters.");
      const res = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: revokeOther,
      });
      if (res.error) throw new Error(res.error.message ?? "Could not update password.");
    },
    onSuccess: () => {
      toast.success(
        revokeOther ? "Password updated. Other devices signed out." : "Password updated.",
      );
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>
          Use a unique passphrase. Compromised passwords are rejected automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pb-6">
        <PasswordField
          id="current"
          label="Current password"
          value={current}
          onChange={setCurrent}
          show={showCurrent}
          onToggle={() => setShowCurrent((s) => !s)}
          autoComplete="current-password"
        />
        <div className="grid gap-2">
          <PasswordField
            id="next"
            label="New password"
            value={next}
            onChange={setNext}
            show={showNext}
            onToggle={() => setShowNext((s) => !s)}
            autoComplete="new-password"
          />
          {next ? (
            <StrengthMeter label={strength.label} value={strength.value} />
          ) : null}
        </div>
        <PasswordField
          id="confirm"
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          show={showNext}
          onToggle={() => setShowNext((s) => !s)}
          autoComplete="new-password"
        />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={revokeOther}
            onChange={(e) => setRevokeOther(e.target.checked)}
          />
          <span className="flex flex-col">
            <span>Sign out of other devices</span>
            <span className="text-xs text-muted-foreground">
              Recommended whenever you suspect a leak.
            </span>
          </span>
        </label>
        <div className="flex justify-end">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !current || !next}
          >
            {mutation.isPending ? "Updating…" : "Update password"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          minLength={8}
          className="pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function StrengthMeter({ label, value }: { label: string; value: number }) {
  const color =
    value < 30 ? "bg-destructive" : value < 60 ? "bg-amber-500" : value < 90 ? "bg-primary" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-all ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-16 text-right text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function passwordStrength(pw: string): { value: number; label: string } {
  if (!pw) return { value: 0, label: "—" };
  let score = 0;
  if (pw.length >= 8) score += 25;
  if (pw.length >= 12) score += 20;
  if (/[A-Z]/.test(pw)) score += 15;
  if (/[a-z]/.test(pw)) score += 10;
  if (/[0-9]/.test(pw)) score += 10;
  if (/[^A-Za-z0-9]/.test(pw)) score += 20;
  const clamped = Math.min(100, score);
  const label =
    clamped < 30 ? "Weak" : clamped < 60 ? "Fair" : clamped < 90 ? "Strong" : "Excellent";
  return { value: clamped, label };
}

// ---------------------------------------------------------------------------
function TwoFactorCard({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  const [password, setPassword] = React.useState("");
  const [enrollState, setEnrollState] = React.useState<{
    totpURI: string;
    backupCodes: string[];
  } | null>(null);
  const [disableOpen, setDisableOpen] = React.useState(false);

  const enableMutation = useMutation({
    mutationFn: async () => {
      const res = await authClient.twoFactor.enable({ password });
      if (res.error) throw new Error(res.error.message ?? "Could not enable 2FA.");
      return res.data as { totpURI: string; backupCodes: string[] };
    },
    onSuccess: (data) => {
      toast.success("2FA enabled. Scan the QR code with your authenticator.");
      setEnrollState(data);
      setPassword("");
      onChange(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      const res = await authClient.twoFactor.disable({ password });
      if (res.error) throw new Error(res.error.message ?? "Could not disable 2FA.");
    },
    onSuccess: () => {
      toast.success("2FA disabled");
      setPassword("");
      setDisableOpen(false);
      onChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              Two-factor authentication
              <Badge variant={enabled ? "success" : "outline"}>
                {enabled ? "Enabled" : "Disabled"}
              </Badge>
            </CardTitle>
            <CardDescription>
              TOTP via Google Authenticator, 1Password, Authy, or any RFC-6238 app.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pb-6">
        {!enabled ? (
          <>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">Why turn this on?</p>
              <p className="mt-1 text-muted-foreground">
                A leaked password alone won&apos;t let an attacker in — they&apos;d also need a
                6-digit code from your authenticator app or one of the 5 single-use backup codes.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="2fa-password">Confirm with your password</Label>
              <Input
                id="2fa-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => enableMutation.mutate()}
                disabled={enableMutation.isPending || !password}
              >
                {enableMutation.isPending ? "Enabling…" : "Enable 2FA"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2 rounded-lg border bg-emerald-50/50 p-3 text-sm dark:bg-emerald-900/10">
              <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" /> Active on your account
              </p>
              <p className="text-muted-foreground">
                You&apos;ll be prompted for a 6-digit code on every sign-in.
              </p>
            </div>
            <div className="flex justify-end">
              <Button variant="destructive" onClick={() => setDisableOpen(true)}>
                Disable 2FA
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <Dialog
        open={!!enrollState}
        onOpenChange={(o) => !o && setEnrollState(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enroll your authenticator</DialogTitle>
            <DialogDescription>
              Scan the QR with your TOTP app, then save these backup codes somewhere safe.
              Each backup code is single-use.
            </DialogDescription>
          </DialogHeader>
          {enrollState ? (
            <EnrollPanel
              totpURI={enrollState.totpURI}
              backupCodes={enrollState.backupCodes}
            />
          ) : null}
          <DialogFooter>
            <Button onClick={() => setEnrollState(null)}>
              <CheckCircle2 /> I&apos;ve saved everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable two-factor?</DialogTitle>
            <DialogDescription>
              Your account becomes password-only after this. Confirm with your current password.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="2fa-disable-password">Password</Label>
            <Input
              id="2fa-disable-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisableOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={disableMutation.isPending || !password}
              onClick={() => disableMutation.mutate()}
            >
              {disableMutation.isPending ? "Disabling…" : "Disable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function downloadBackupCodes(codes: string[]) {
  const header = [
    "Notification Center — two-factor backup codes",
    `Generated ${new Date().toISOString()}`,
    "",
    "Each code works once. Treat them like passwords.",
    "",
  ].join("\n");
  const body = codes.map((c, i) => `${String(i + 1).padStart(2, "0")}. ${c}`).join("\n");
  const blob = new Blob([`${header}${body}\n`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nc-backup-codes-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success("Backup codes downloaded");
}

// ---------------------------------------------------------------------------
function EnrollPanel({
  totpURI,
  backupCodes,
}: {
  totpURI: string;
  backupCodes: string[];
}) {
  const [showUri, setShowUri] = React.useState(false);
  const secret = React.useMemo(() => {
    try {
      const url = new URL(totpURI);
      return url.searchParams.get("secret") ?? "";
    } catch {
      return "";
    }
  }, [totpURI]);

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-4">
        <QrCode value={totpURI} size={184} />
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Open your authenticator app and scan the code above.
          </p>
        </div>
      </div>

      {secret ? (
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Or enter this secret manually
          </Label>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={secret}
              className="font-mono text-xs tracking-widest"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                navigator.clipboard.writeText(secret);
                toast.success("Secret copied");
              }}
            >
              <Copy />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Backup codes
          </Label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(backupCodes.join("\n"));
                toast.success("Backup codes copied");
              }}
            >
              <Copy className="mr-1 size-3" /> Copy
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => downloadBackupCodes(backupCodes)}
            >
              <Download className="mr-1 size-3" /> Download
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3">
          {backupCodes.map((code) => (
            <code
              key={code}
              className="rounded bg-background px-2 py-1.5 text-center font-mono text-xs"
            >
              {code}
            </code>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Store these somewhere safe — they let you sign in if you lose your authenticator.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setShowUri((v) => !v)}
        className="text-left text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        {showUri ? "Hide raw URI" : "Show raw URI"}
      </button>
      {showUri ? (
        <Input readOnly value={totpURI} className="font-mono text-[10px]" />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
function RecentActivityCard({ events }: { events: RecentEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>The last 10 identity events for your account.</CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {events.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <ol className="divide-y">
            {events.map((event) => {
              const Icon =
                event.outcome === "SUCCESS"
                  ? CheckCircle2
                  : event.outcome === "FAILURE"
                    ? XCircle
                    : AlertTriangle;
              const tone =
                event.outcome === "SUCCESS"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : event.outcome === "FAILURE"
                    ? "text-destructive"
                    : "text-amber-600 dark:text-amber-400";
              return (
                <li key={event.id} className="flex items-start gap-3 px-6 py-3">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">
                        {event.action.replace(/_/g, " ").toLowerCase()}
                      </span>
                      {event.method ? (
                        <Badge variant="outline" className="text-[10px]">
                          {event.method}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {event.ipAddress ? <span>{event.ipAddress}</span> : null}
                      <span>{new Date(event.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div className="border-t px-6 py-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/activity">See all events</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function DangerZoneCard() {
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const revokeOthersMutation = useMutation({
    mutationFn: async () => {
      const res = await authClient.revokeOtherSessions();
      if (res.error) throw new Error(res.error.message ?? "Could not revoke");
    },
    onSuccess: () => {
      toast.success("Other devices signed out");
      setConfirmOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-4" /> Danger zone
        </CardTitle>
        <CardDescription>
          Irreversible or wide-blast actions. Read the consequence before clicking.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 pb-6">
        <DangerRow
          title="Sign out everywhere else"
          body="Invalidates every active session for this account except your current device."
          action={
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              <LogOut />
              Sign out
            </Button>
          }
        />
        <DangerRow
          title="Delete this account"
          body="Soft-deletes the user record after a grace period. Requires a follow-up confirmation step."
          action={
            <Button variant="outline" disabled>
              Coming soon
            </Button>
          }
        />
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out every other device?</DialogTitle>
            <DialogDescription>
              You stay signed in here. Every other session for your account is invalidated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revokeOthersMutation.isPending}
              onClick={() => revokeOthersMutation.mutate()}
            >
              {revokeOthersMutation.isPending ? "Signing out…" : "Sign out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DangerRow({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{body}</p>
      </div>
      {action}
    </div>
  );
}
