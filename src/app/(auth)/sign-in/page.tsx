"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Fingerprint, KeyRound, ShieldCheck } from "lucide-react";
import { authClient } from "@root/lib/auth-client";
import { Button } from "@root/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@root/components/ui/card";
import { Input } from "@root/components/ui/input";
import { Label } from "@root/components/ui/label";
import { Alert, AlertDescription } from "@root/components/ui/alert";
import { Separator } from "@root/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@root/components/ui/tabs";

/**
 * Admin sign-in page.
 *
 * Two-step state machine:
 *
 *   step = "password"
 *     ├─ Phone + password   → `authClient.signIn.phoneNumber`
 *     │     • on twoFactorRedirect → transition to step="two-factor"
 *     │     • on success → /dashboard
 *     └─ Passkey (WebAuthn) → `authClient.signIn.passkey({ autoFill: true })`
 *
 *   step = "two-factor"
 *     ├─ TOTP code           → `authClient.twoFactor.verifyTotp`
 *     ├─ Backup code         → `authClient.twoFactor.verifyBackupCode`
 *     └─ Passkey (escape)    → `authClient.signIn.passkey()` — bypasses the
 *                              partial 2FA state and re-authenticates fresh.
 */
type Step = "password" | "two-factor";
type SecondFactorTab = "totp" | "passkey" | "backup";

export default function SignInPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [twoFactorMethods, setTwoFactorMethods] = useState<string[]>([]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authClient.signIn
      .passkey({ autoFill: true })
      .then((res) => {
        if (cancelled) return;
        if (res?.error) return;
        if (res?.data) {
          // eslint-disable-next-line react-doctor/nextjs-no-client-side-redirect
          router.replace("/dashboard");
          // eslint-disable-next-line react-doctor/react-compiler-destructure-method
          router.refresh();
        }
      })
      .catch(() => {
        // Conditional UI not supported — silently ignore.
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onPasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const { data, error: signInError } = await authClient.signIn.phoneNumber({
      phoneNumber,
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message ?? "Sign-in failed. Check your credentials and try again.");
      return;
    }
    // Better Auth's twoFactor plugin returns this shape instead of the
    // usual session payload when 2FA is required.
    const tfData = data as { twoFactorRedirect?: boolean; twoFactorMethods?: string[] } | null;
    if (tfData?.twoFactorRedirect) {
      setTwoFactorMethods(tfData.twoFactorMethods ?? ["totp"]);
      setStep("two-factor");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  async function onPasskeySignIn() {
    setError(null);
    setPasskeySubmitting(true);
    const res = await authClient.signIn.passkey();
    setPasskeySubmitting(false);
    if (res?.error) {
      setError(res.error.message ?? "Passkey sign-in failed.");
      return;
    }
    if (res?.data) {
      router.replace("/dashboard");
      router.refresh();
    }
  }

  if (step === "two-factor") {
    return (
      <TwoFactorStep
        methods={twoFactorMethods}
        error={error}
        setError={setError}
        onSuccess={() => {
          router.replace("/dashboard");
          router.refresh();
        }}
        onBack={() => {
          setStep("password");
          setError(null);
          setPassword("");
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Access the Notification Center admin panel.</CardDescription>
      </CardHeader>
      <form onSubmit={onPasswordSubmit}>
        <CardContent className="flex flex-col gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="phoneNumber">Phone number</Label>
            <Input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              autoComplete="username webauthn"
              inputMode="tel"
              required
              placeholder="+989121234567"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password webauthn"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
          <div className="relative w-full">
            <Separator className="absolute inset-x-0 top-1/2" />
            <span className="relative mx-auto block w-max bg-card px-2 text-xs text-muted-foreground">
              or
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onPasskeySignIn}
            disabled={passkeySubmitting}
          >
            <Fingerprint />
            {passkeySubmitting ? "Waiting for authenticator…" : "Sign in with passkey"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function TwoFactorStep({
  methods,
  error,
  setError,
  onSuccess,
  onBack,
}: {
  methods: string[];
  error: string | null;
  setError: (e: string | null) => void;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const hasTotp = methods.includes("totp") || methods.length === 0;
  // Passkey is always available as an escape hatch on the 2FA step — if the
  // user has no passkey registered, the WebAuthn prompt fails silently and
  // they fall back to TOTP.
  const [tab, setTab] = useState<SecondFactorTab>(hasTotp ? "totp" : "passkey");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);
  const [backupCode, setBackupCode] = useState("");

  async function onTotpSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await authClient.twoFactor.verifyTotp({ code, trustDevice });
    setSubmitting(false);
    if (res?.error) {
      setError(res.error.message ?? "Invalid code. Try again.");
      return;
    }
    onSuccess();
  }

  async function onBackupSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await authClient.twoFactor.verifyBackupCode({ code: backupCode, trustDevice });
    setSubmitting(false);
    if (res?.error) {
      setError(res.error.message ?? "Invalid backup code.");
      return;
    }
    onSuccess();
  }

  async function onPasskey() {
    setError(null);
    setPasskeySubmitting(true);
    const res = await authClient.signIn.passkey();
    setPasskeySubmitting(false);
    if (res?.error) {
      setError(res.error.message ?? "Passkey sign-in failed.");
      return;
    }
    if (res?.data) onSuccess();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <CardTitle>Two-step verification</CardTitle>
            <CardDescription>Confirm with a second factor to finish signing in.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Tabs value={tab} onValueChange={(v) => setTab(v as SecondFactorTab)}>
          <TabsList className="w-full">
            {hasTotp ? (
              <TabsTrigger value="totp" className="flex-1">
                <KeyRound className="size-3.5" /> Code
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="passkey" className="flex-1">
              <Fingerprint className="size-3.5" /> Passkey
            </TabsTrigger>
            <TabsTrigger value="backup" className="flex-1">
              Backup
            </TabsTrigger>
          </TabsList>

          {hasTotp ? (
            <TabsContent value="totp" className="mt-4">
              <form onSubmit={onTotpSubmit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="totp-code">Authenticator code</Label>
                  <Input
                    id="totp-code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="text-center text-xl tracking-[0.5em] font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Open your authenticator app and enter the 6-digit code.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={trustDevice}
                    onChange={(e) => setTrustDevice(e.target.checked)}
                  />
                  Trust this device for 60 days
                </label>
                <Button type="submit" disabled={submitting || code.length !== 6}>
                  {submitting ? "Verifying…" : "Verify and sign in"}
                </Button>
              </form>
            </TabsContent>
          ) : null}

          <TabsContent value="passkey" className="mt-4">
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-6 text-center">
              <Fingerprint className="size-10 text-primary" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Use your registered passkey</p>
                <p className="text-xs text-muted-foreground">
                  Your browser or hardware security key will prompt you to confirm.
                </p>
              </div>
              <Button
                type="button"
                onClick={onPasskey}
                disabled={passkeySubmitting}
                className="w-full"
              >
                {passkeySubmitting ? "Waiting for authenticator…" : "Continue with passkey"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="backup" className="mt-4">
            <form onSubmit={onBackupSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="backup-code">Backup code</Label>
                <Input
                  id="backup-code"
                  autoComplete="one-time-code"
                  required
                  placeholder="XXXX-XXXX"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Each backup code works once. Generate new ones afterwards from Security.
                </p>
              </div>
              <Button type="submit" disabled={submitting || !backupCode}>
                {submitting ? "Verifying…" : "Use backup code"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter>
        <Button type="button" variant="ghost" onClick={onBack} className="w-full">
          <ArrowLeft /> Back to sign in
        </Button>
      </CardFooter>
    </Card>
  );
}
