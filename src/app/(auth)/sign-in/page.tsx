"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fingerprint } from "lucide-react";
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

/**
 * Admin sign-in page.
 *
 * Two authentication paths:
 *  1. Phone + password   → `authClient.signIn.phoneNumber({ phoneNumber, password })`
 *  2. Passkey (WebAuthn) → `authClient.signIn.passkey({ autoFill: true })`
 *     `autoFill: true` enables Conditional UI on the username field below,
 *     so if the browser has a passkey for this RP it offers it inline. We
 *     also surface an explicit button for the non-autofill path.
 */
export default function SignInPage() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);

  /**
   * Kick off Conditional Mediation so the platform autofills the phone field
   * with credentials the browser already has. The promise stays unresolved
   * until the user picks a credential or navigates away — we don't await it.
   */
  useEffect(() => {
    let cancelled = false;
    authClient.signIn
      .passkey({ autoFill: true })
      .then((res) => {
        if (cancelled) return;
        if (res?.error) return;
        if (res?.data) {
          router.replace("/dashboard");
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
    const { error: signInError } = await authClient.signIn.phoneNumber({
      phoneNumber,
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message ?? "Sign-in failed. Check your credentials and try again.");
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
