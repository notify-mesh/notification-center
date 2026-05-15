import { headers } from "next/headers";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  Fingerprint,
  KeyRound,
  MonitorSmartphone,
  Send,
  Users,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@root/components/ui/tabs";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  // KPIs in parallel — none are remotely fancy but all are real.
  // RSC body: `Date.now` is fine here (one call per request, server-side).
  // eslint-disable-next-line react-hooks/purity
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [orgsCount, projectsCount, apiKeysCount, passkeysCount, sessions24h] = await Promise.all([
    prismaDbClient.organization.count(),
    prismaDbClient.project.count({ where: { archivedAt: null } }),
    prismaDbClient.apiKey.count({ where: { revokedAt: null } }),
    prismaDbClient.passkey.count(),
    prismaDbClient.authAuditLog.count({ where: { createdAt: { gte: since } } }),
  ]);

  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title={`Welcome back, ${session?.user.name?.split(" ")[0] ?? "Admin"}`}
        description="Here's what's happening across your notification platform today."
        actions={
          <>
            <Button asChild variant="outline">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /api is an oRPC handler, not a Next page */}
              <a href="/api">
                API reference
                <ArrowUpRight />
              </a>
            </Button>
            <Button asChild>
              <Link href="/send">
                <Send />
                Send notification
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Organizations" value={orgsCount} icon={Building2} hint="active across platform" />
        <Kpi label="Active projects" value={projectsCount} icon={Send} hint="non-archived" />
        <Kpi label="API keys" value={apiKeysCount} icon={KeyRound} hint="not revoked" />
        <Kpi label="Auth events (24h)" value={sessions24h} icon={Users} hint="all members" />
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
              <CardDescription>Jump straight into common admin tasks.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 pb-6 sm:grid-cols-2">
              <ActionLink
                href="/organizations/new"
                icon={Building2}
                title="Create organization"
                description="Spin up a new tenant with its own teams and projects."
              />
              <ActionLink
                href="/teams"
                icon={Users}
                title="Invite a teammate"
                description="Add members and assign roles."
              />
              <ActionLink
                href="/api-keys/new"
                icon={KeyRound}
                title="Issue API key"
                description="With IP/origin/quota restrictions."
              />
              <ActionLink
                href="/passkeys"
                icon={Fingerprint}
                title="Register a passkey"
                description="Replace your password with phishing-resistant auth."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Signed in as {session?.user.email}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pb-6 text-sm">
              <Row label="Name" value={session?.user.name ?? "—"} />
              <Row label="Email" value={session?.user.email ?? "—"} />
              <Row
                label="Role"
                value={
                  <Badge variant="default">
                    {(session?.user as { role?: string | null })?.role ?? "user"}
                  </Badge>
                }
              />
              <Row
                label="2FA"
                value={
                  (session?.user as { twoFactorEnabled?: boolean | null })?.twoFactorEnabled ? (
                    <Badge variant="success">Enabled</Badge>
                  ) : (
                    <Badge variant="outline">Disabled</Badge>
                  )
                }
              />
              <Row label="Passkeys" value={passkeysCount.toString()} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Fingerprint className="size-4" /> Passkeys
              </CardTitle>
              <CardDescription>
                Manage WebAuthn credentials for phishing-resistant sign-in.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between pb-6">
              <div className="text-3xl font-bold tabular-nums">{passkeysCount}</div>
              <Button asChild variant="outline">
                <Link href="/passkeys">
                  Manage
                  <ArrowUpRight />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MonitorSmartphone className="size-4" /> Devices
              </CardTitle>
              <CardDescription>
                Review active sessions and revoke any you don&apos;t recognise.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-6">
              <Button asChild variant="outline">
                <Link href="/devices">
                  Manage devices
                  <ArrowUpRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="grid gap-4 lg:grid-cols-3">
          <ApiLinkCard
            title="Scalar reference"
            description="Interactive OpenAPI explorer."
            href="/api"
          />
          <ApiLinkCard
            title="OpenAPI document"
            description="Machine-readable JSON spec."
            href="/api/spec.json"
          />
          <ApiLinkCard
            title="oRPC endpoint"
            description="Compact RPC for type-safe clients."
            href="/rpc"
          />
        </TabsContent>
      </Tabs>
    </Main>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="pb-6">
        <div className="text-3xl font-bold tabular-nums">{value}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ActionLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href as never}
      className="group flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
        <span className="font-medium">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </Link>
  );
}

function ApiLinkCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pb-6">
        <a
          href={href}
          className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
        >
          Open
          <ArrowUpRight className="size-4" />
        </a>
      </CardContent>
    </Card>
  );
}
