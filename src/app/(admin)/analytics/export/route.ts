import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@root/lib/auth";
import { resolveActiveOrgId, ActiveOrgError } from "@root/lib/orpc/active-org";
import { streamNotificationRows } from "@root/lib/notify/analytics";
import { prismaDbClient } from "@root/lib/prisma";

/**
 * `GET /analytics/export?...` — stream filtered notification rows as CSV.
 *
 * Lives under the (admin) route group so the proxy middleware still gates
 * it behind a valid session. Output is `text/csv; charset=utf-8` with the
 * `Content-Disposition: attachment` filename hint so browsers offer a
 * "Save As" prompt instead of rendering inline.
 *
 * Memory profile: rows stream from Prisma in pages of 500 via
 * `streamNotificationRows`, encoded into the `ReadableStream`'s queue
 * one row at a time — bounded by the page size regardless of total volume.
 *
 * Query params (all optional, all snake-case so a curl is friendly):
 *   ?projectId=         scope
 *   ?environmentId=     scope
 *   ?channel=sms        channelUsed filter
 *   ?provider=kavenegar provider filter (joined via attempts)
 *   ?templateName=      template filter
 *   ?since=ISO          inclusive lower bound (defaults to 7 days ago)
 *   ?until=ISO          inclusive upper bound (defaults to now)
 */
export async function GET(request: Request) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Bypass the oRPC layer here so we can stream — the same `resolveActiveOrgId`
  // helper gives the procedures their org id.
  let organizationId: string;
  try {
    organizationId = await resolveActiveOrgId({
      headers: requestHeaders,
      session,
      ip: null,
    });
  } catch (e) {
    if (e instanceof ActiveOrgError) {
      return new NextResponse(e.message, { status: 404 });
    }
    throw e;
  }

  const url = new URL(request.url);
  const since = parseDate(url.searchParams.get("since")) ?? new Date(Date.now() - 7 * 86_400_000);
  const until = parseDate(url.searchParams.get("until")) ?? new Date();

  const filters = {
    organizationId,
    projectId: url.searchParams.get("projectId") ?? undefined,
    environmentId: url.searchParams.get("environmentId") ?? undefined,
    channel: url.searchParams.get("channel") ?? undefined,
    provider: url.searchParams.get("provider") ?? undefined,
    templateName: url.searchParams.get("templateName") ?? undefined,
    since,
    until,
  };

  // Resolve project/env *labels* up front so the CSV reads as something
  // operational (slug + env name) rather than opaque cuid2 strings.
  const [projects, envs] = await Promise.all([
    prismaDbClient.project.findMany({
      where: { organizationId },
      select: { id: true, slug: true },
    }),
    prismaDbClient.projectEnvironment.findMany({
      where: { project: { organizationId } },
      select: { id: true, name: true },
    }),
  ]);
  const projectLabel = new Map(projects.map((p) => [p.id, p.slug]));
  const envLabel = new Map(envs.map((e) => [e.id, e.name]));

  const HEADERS = [
    "id",
    "createdAt",
    "status",
    "channel",
    "templateName",
    "project",
    "environment",
    "toPhone",
    "toEmail",
    "reason",
    "costIrr",
  ];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(HEADERS.join(",") + "\n"));
      try {
        for await (const row of streamNotificationRows(filters)) {
          const line = [
            row.id,
            row.createdAt.toISOString(),
            row.status,
            row.channelUsed ?? "",
            row.templateName ?? "",
            projectLabel.get(row.projectId) ?? row.projectId,
            envLabel.get(row.environmentId) ?? row.environmentId,
            row.toPhone ?? "",
            row.toEmail ?? "",
            row.reason ?? "",
            row.costIrr ?? "",
          ]
            .map(csvCell)
            .join(",");
          controller.enqueue(encoder.encode(line + "\n"));
        }
      } catch (e) {
        controller.error(e);
        return;
      }
      controller.close();
    },
  });

  const stamp = `${since.toISOString().slice(0, 10)}_to_${until.toISOString().slice(0, 10)}`;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="notifications_${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * RFC 4180 escaping — wrap in quotes when the cell contains a comma, quote,
 * or newline, and double up any embedded quotes. Numbers and `null`s become
 * their `String(...)` form (empty when null).
 */
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
