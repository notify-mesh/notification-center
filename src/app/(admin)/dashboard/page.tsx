import { headers } from "next/headers";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Fingerprint,
  Gauge,
  KeyRound,
  MonitorSmartphone,
  Send,
  Users,
} from "lucide-react";
import { auth } from "@root/lib/auth";
import { prismaDbClient } from "@root/lib/prisma";
import { resolveActiveOrgId, ActiveOrgError } from "@root/lib/orpc/active-org";
import { getAnalyticsSummary } from "@root/lib/notify/analytics";
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
import { KpiCard } from "@root/components/charts/kpi-card";
import { AreaChartCard, Sparkline } from "@root/components/charts/area-chart-card";
import { DonutChartCard } from "@root/components/charts/donut-chart-card";

export default async function DashboardPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  // Resolve the org so analytics can be scoped. If the user has no org yet,
  // we still render the platform widgets — they just see zeros.
  let organizationId: string | null = null;
  try {
    organizationId = await resolveActiveOrgId({
      headers: requestHeaders,
      session: session,
      ip: null,
    });
  } catch (e) {
    if (!(e instanceof ActiveOrgError)) throw e;
  }

  // Platform counts (unchanged).
  // eslint-disable-next-line react-hooks/purity -- RSC: one call per request, not during a client render
  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [orgsCount, projectsCount, apiKeysCount, passkeysCount, sessions24h] = await Promise.all([
    prismaDbClient.organization.count(),
    prismaDbClient.project.count({ where: { archivedAt: null } }),
    prismaDbClient.apiKey.count({ where: { revokedAt: null } }),
    prismaDbClient.passkey.count(),
    prismaDbClient.authAuditLog.count({ where: { createdAt: { gte: since24 } } }),
  ]);

  // 7-day analytics summary — drives KPIs, area chart, channel donut.
  const summary = organizationId
    ? await getAnalyticsSummary({ organizationId })
    : null;

  const deliveryDelta = summary ? pctDelta(summary.totals.sent, summary.prior.sent) : null;
  const failureDelta = summary ? pctDelta(summary.totals.failed, summary.prior.failed) : null;

  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title={`Welcome back, ${session?.user.name?.split(" ")[0] ?? "Admin"}`}
        description="Notification volume, delivery health, and quick links across your platform."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/analytics">
                <BarChart3 />
                Open analytics
              </Link>
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

      {/* ───── KPI strip — driven by 7-day analytics summary ───── */}
      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Sent (7d)"
            value={summary.totals.sent}
            hint={`${summary.totals.deliveryRatePct}% delivery rate`}
            icon={Send}
            delta={deliveryDelta}
            trail={
              <Sparkline
                data={summary.timeline}
                xKey="bucket"
                dataKey="sent"
                color="var(--chart-1)"
              />
            }
          />
          <KpiCard
            label="Failed (7d)"
            value={summary.totals.failed}
            hint={`${summary.totals.failureRatePct}% failure rate`}
            icon={AlertTriangle}
            delta={failureDelta}
            trail={
              <Sparkline
                data={summary.timeline}
                xKey="bucket"
                dataKey="failed"
                color="var(--destructive)"
              />
            }
          />
          <KpiCard
            label="Latency p95"
            value={`${summary.latency.p95} ms`}
            hint={`p50 ${summary.latency.p50}ms · p99 ${summary.latency.p99}ms`}
            icon={Gauge}
          />
          <KpiCard
            label="Cost (7d)"
            value={summary.costIrr.total.toLocaleString()}
            hint="IRR across all channels"
            icon={CheckCircle2}
          />
        </div>
      ) : null}

      {/* ───── Send volume chart + channel mix ───── */}
      {summary ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <AreaChartCard
            title="Send volume — last 7 days"
            description="Stacked sent + failed counts per day"
            data={summary.timeline}
            xKey="bucket"
            series={[
              { dataKey: "sent", label: "Sent", color: "var(--chart-1)" },
              { dataKey: "failed", label: "Failed", color: "var(--destructive)" },
            ]}
            className="lg:col-span-2"
            xTickFormatter={(s) => s.slice(5)}
            showYAxis
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/analytics">
                  Details
                  <ArrowUpRight />
                </Link>
              </Button>
            }
          />
          <DonutChartCard
            title="Channel mix"
            description="Successful sends by channel"
            data={summary.byChannel.map((c, i) => ({
              name: c.channel,
              value: c.sent,
              color: `var(--chart-${(i % 5) + 1})`,
            }))}
            centerLabel={summary.totals.sent.toLocaleString()}
            centerSub="total sent"
          />
        </div>
      ) : null}

      {/* ───── Platform counts + Quick actions ───── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Platform</CardTitle>
            <CardDescription>Operator-visible totals.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 pb-6">
            <PlatformStat icon={Building2} label="Orgs" value={orgsCount} />
            <PlatformStat icon={KeyRound} label="API keys" value={apiKeysCount} />
            <PlatformStat icon={Send} label="Projects" value={projectsCount} />
            <PlatformStat icon={Users} label="Auth events (24h)" value={sessions24h} />
          </CardContent>
        </Card>

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
      </div>

      {/* ───── Account + Devices ───── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Signed in as {session?.user.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pb-6 text-sm">
            <Row label="Name" value={session?.user.name ?? "—"} />
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fingerprint className="size-4" /> Passkeys
            </CardTitle>
            <CardDescription>Phishing-resistant credentials.</CardDescription>
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
            <CardDescription>Review and revoke active sessions.</CardDescription>
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
      </div>
    </Main>
  );
}

function pctDelta(current: number, prior: number): number | null {
  if (prior === 0) return current === 0 ? 0 : null;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

function PlatformStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex items-center justify-between">
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
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
