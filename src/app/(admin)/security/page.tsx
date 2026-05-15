import { headers } from "next/headers";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { auth } from "@root/lib/auth";
import { prismaDbClient } from "@root/lib/prisma";
import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { Badge } from "@root/components/ui/badge";
import { Button } from "@root/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@root/components/ui/card";
import { SecurityClient } from "./security-client";

export default async function SecurityPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  const userId = session!.user.id;

  // Run independent reads in parallel; each one is small + indexed.
  const [
    passkeyCount,
    sessionsActive,
    recentEvents,
    user,
    twoFactorRow,
  ] = await Promise.all([
    prismaDbClient.passkey.count({ where: { userId } }),
    auth.api.listSessions({ headers: requestHeaders }).catch(() => []),
    prismaDbClient.authAuditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prismaDbClient.user.findUnique({
      where: { id: userId },
      select: {
        passwordChangedAt: true,
        passwordCompromised: true,
        twoFactorEnabled: true,
        lastLoginMethod: true,
        lastLoginAt: true,
      },
    }),
    prismaDbClient.twoFactor.findFirst({ where: { userId, verified: true } }),
  ]);

  const twoFactorEnabled = !!user?.twoFactorEnabled || !!twoFactorRow;

  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="Security"
        description="Posture overview, credential management, and a recent activity feed scoped to your account."
        actions={
          <Button asChild variant="outline">
            <Link href="/activity">
              All activity
              <ArrowUpRight />
            </Link>
          </Button>
        }
      />

      <SecurityOverview
        passkeyCount={passkeyCount}
        sessionsActive={sessionsActive.length}
        twoFactorEnabled={twoFactorEnabled}
        passwordChangedAt={user?.passwordChangedAt ?? null}
        passwordCompromised={user?.passwordCompromised ?? false}
        lastLoginMethod={user?.lastLoginMethod ?? null}
        lastLoginAt={user?.lastLoginAt ?? null}
      />

      <SecurityClient
        initialTwoFactorEnabled={twoFactorEnabled}
        recentEvents={recentEvents.map((e) => ({
          id: e.id,
          action: e.action,
          outcome: e.outcome,
          method: e.method,
          ipAddress: e.ipAddress,
          createdAt: e.createdAt.toISOString(),
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" /> Tips
          </CardTitle>
          <CardDescription>
            Small habits that drastically reduce your account&apos;s attack surface.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 pb-6 text-sm sm:grid-cols-2">
          <Tip
            label="Use a passkey"
            body="Phishing-resistant, no password to leak. Register one in Passkeys."
          />
          <Tip
            label="Enable 2FA"
            body="Adds a second factor (TOTP code) on top of the password."
          />
          <Tip
            label="Audit your devices weekly"
            body="Revoke anything on Devices that you don't recognise."
          />
          <Tip
            label="Don't reuse passwords"
            body={
              <>
                We check against {""}
                <Badge variant="outline" className="text-[10px]">
                  Have I Been Pwned
                </Badge>{" "}
                on every password change.
              </>
            }
          />
        </CardContent>
      </Card>
    </Main>
  );
}

function SecurityOverview(props: {
  passkeyCount: number;
  sessionsActive: number;
  twoFactorEnabled: boolean;
  passwordChangedAt: Date | null;
  passwordCompromised: boolean;
  lastLoginMethod: string | null;
  lastLoginAt: Date | null;
}) {
  const score = computeScore(props);
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card className="md:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Security score</CardTitle>
          <CardDescription>Rough indicator of posture.</CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">{score.value}</span>
            <span className="text-sm text-muted-foreground">/ 100</span>
          </div>
          <Badge
            variant={
              score.value >= 80 ? "success" : score.value >= 50 ? "warning" : "destructive"
            }
            className="mt-2"
          >
            {score.label}
          </Badge>
        </CardContent>
      </Card>
      <OverviewStat
        label="Passkeys"
        value={props.passkeyCount}
        ok={props.passkeyCount > 0}
        href="/passkeys"
      />
      <OverviewStat
        label="2FA"
        value={props.twoFactorEnabled ? "Enabled" : "Disabled"}
        ok={props.twoFactorEnabled}
      />
      <OverviewStat
        label="Active devices"
        value={props.sessionsActive}
        ok={props.sessionsActive < 5}
        href="/devices"
      />
    </div>
  );
}

function OverviewStat({
  label,
  value,
  ok,
  href,
}: {
  label: string;
  value: number | string;
  ok: boolean;
  href?: string;
}) {
  const content = (
    <>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pb-6">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-3xl font-bold tabular-nums">{value}</span>
          <Badge variant={ok ? "success" : "warning"}>{ok ? "Good" : "Review"}</Badge>
        </div>
      </CardContent>
    </>
  );
  if (!href) return <Card>{content}</Card>;
  return (
    <Card>
      <Link href={href as never} className="block transition-colors hover:bg-muted/30">
        {content}
      </Link>
    </Card>
  );
}

function Tip({ label, body }: { label: string; body: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function computeScore(p: {
  passkeyCount: number;
  twoFactorEnabled: boolean;
  passwordCompromised: boolean;
  sessionsActive: number;
}) {
  let score = 50;
  if (p.passkeyCount > 0) score += 25;
  if (p.twoFactorEnabled) score += 20;
  if (!p.passwordCompromised) score += 10;
  if (p.sessionsActive < 5) score += 5;
  if (p.passwordCompromised) score -= 30;
  const clamped = Math.max(0, Math.min(100, score));
  return {
    value: clamped,
    label: clamped >= 80 ? "Strong" : clamped >= 50 ? "Okay" : "At risk",
  };
}
