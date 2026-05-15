import { headers } from "next/headers";
import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  Fingerprint,
  Languages,
  Mail,
  MonitorSmartphone,
  Phone,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { auth } from "@root/lib/auth";
import { prismaDbClient } from "@root/lib/prisma";
import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { Button } from "@root/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@root/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@root/components/ui/avatar";
import { Badge } from "@root/components/ui/badge";
import { AccountClient } from "./account-client";

export default async function AccountPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  const userId = session!.user.id;

  const [user, passkeysCount, sessionsActive, recentLogin] = await Promise.all([
    prismaDbClient.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        phoneNumber: true,
        phoneNumberVerified: true,
        username: true,
        displayUsername: true,
        locale: true,
        timezone: true,
        lastLoginMethod: true,
        lastLoginAt: true,
        twoFactorEnabled: true,
        role: true,
        passwordChangedAt: true,
        passwordCompromised: true,
        createdAt: true,
      },
    }),
    prismaDbClient.passkey.count({ where: { userId } }),
    auth.api.listSessions({ headers: requestHeaders }).catch(() => []),
    prismaDbClient.authAuditLog.findFirst({
      where: { userId, action: "SIGN_IN", outcome: "SUCCESS" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const initials = (user?.name ?? session!.user.email)
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="Account"
        description="Profile, preferences, and quick links to your security posture."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---- Profile card ---- */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="size-4" /> Profile
            </CardTitle>
            <CardDescription>Everything below is editable inline.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 pb-6">
            <div className="flex items-center gap-4">
              <Avatar className="size-16 rounded-2xl">
                {user?.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
                <AvatarFallback className="rounded-2xl text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{user?.name}</p>
                <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="default">{user?.role ?? "user"}</Badge>
                  {user?.emailVerified ? (
                    <Badge variant="success" className="text-[10px]">
                      <BadgeCheck className="size-3" /> Email
                    </Badge>
                  ) : null}
                  {user?.phoneNumberVerified ? (
                    <Badge variant="success" className="text-[10px]">
                      <BadgeCheck className="size-3" /> Phone
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>

            <AccountClient
              initial={{
                name: user?.name ?? "",
                username: user?.username ?? "",
                displayUsername: user?.displayUsername ?? "",
                locale: user?.locale ?? "fa-IR",
                timezone: user?.timezone ?? "Asia/Tehran",
              }}
            />
          </CardContent>
        </Card>

        {/* ---- Quick links ---- */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Security</CardTitle>
              <CardDescription>Passwords, 2FA, danger zone.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 pb-6">
              <QuickLink href="/security" icon={ShieldCheck} label="Open security panel" />
              <QuickLink href="/passkeys" icon={Fingerprint} label={`Passkeys (${passkeysCount})`} />
              <QuickLink
                href="/devices"
                icon={MonitorSmartphone}
                label={`Devices (${sessionsActive.length})`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account snapshot</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 pb-6 text-sm">
              <Row icon={Mail} label="Email" value={user?.email ?? "—"} />
              <Row icon={Phone} label="Phone" value={user?.phoneNumber ?? "—"} />
              <Row
                icon={Languages}
                label="Locale"
                value={`${user?.locale ?? "fa-IR"} · ${user?.timezone ?? "Asia/Tehran"}`}
              />
              <Row
                icon={ShieldCheck}
                label="2FA"
                value={user?.twoFactorEnabled ? "Enabled" : "Disabled"}
              />
              <Row
                icon={BadgeCheck}
                label="Member since"
                value={user?.createdAt ? user.createdAt.toLocaleDateString() : "—"}
              />
              <Row
                icon={UserIcon}
                label="Last sign-in"
                value={
                  recentLogin
                    ? `${recentLogin.method ?? "credential"} · ${recentLogin.createdAt.toLocaleString()}`
                    : "—"
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </Main>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Button asChild variant="outline" className="justify-between">
      <Link href={href as never}>
        <span className="inline-flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {label}
        </span>
        <ArrowUpRight />
      </Link>
    </Button>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
