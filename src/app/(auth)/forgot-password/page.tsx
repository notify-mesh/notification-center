"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

/**
 * Step 1 of the phone-OTP reset flow.
 *
 * Hits `authClient.phoneNumber.requestPasswordReset({ phoneNumber })`, which
 * fires Better Auth's `sendPasswordResetOTP` callback → `sendOtpSms` →
 * Kavenegar/ADP. Better Auth deliberately returns `{status: true}` regardless
 * of whether the phone exists in the DB, so this page can't be used to
 * enumerate accounts.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: reqError } = await authClient.phoneNumber.requestPasswordReset({
      phoneNumber,
    });

    setSubmitting(false);

    if (reqError) {
      setError(reqError.message ?? "Could not send OTP. Try again.");
      return;
    }

    // Carry the phone through the URL so the next step doesn't re-ask the
    // user. The OTP itself lives only in the user's pocket.
    const params = new URLSearchParams({ phoneNumber });
    router.push(`/reset-password?${params.toString()}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter the phone number on your admin account. We&apos;ll send you a 6-digit code.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
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
              autoComplete="tel"
              inputMode="tel"
              required
              placeholder="+989121234567"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Sending code…" : "Send code"}
          </Button>
          <Link
            href="/sign-in"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
