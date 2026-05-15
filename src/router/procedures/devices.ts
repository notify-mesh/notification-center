import "server-only";

import { z } from "zod";
import { authedProcedure } from "@root/lib/orpc";
import { auth } from "@root/lib/auth";

/**
 * Best-effort user-agent parser. Lightweight enough to ship in this file
 * — for serious analytics swap in `ua-parser-js` later.
 */
function parseUserAgent(ua?: string | null) {
  if (!ua) return { os: "Unknown", browser: "Unknown", deviceType: "unknown" };
  const u = ua.toLowerCase();

  let os = "Unknown";
  if (u.includes("windows")) os = "Windows";
  else if (u.includes("mac os x") || u.includes("macintosh")) os = "macOS";
  else if (u.includes("iphone") || u.includes("ipad")) os = "iOS";
  else if (u.includes("android")) os = "Android";
  else if (u.includes("linux")) os = "Linux";

  let browser = "Unknown";
  if (u.includes("edg/")) browser = "Edge";
  else if (u.includes("chrome/") && !u.includes("edg/")) browser = "Chrome";
  else if (u.includes("firefox/")) browser = "Firefox";
  else if (u.includes("safari/") && !u.includes("chrome/")) browser = "Safari";
  else if (u.includes("opr/")) browser = "Opera";

  const isMobile = /mobile|iphone|android|ipad|tablet/.test(u);
  const deviceType = isMobile ? "mobile" : "desktop";

  return { os, browser, deviceType };
}

const deviceSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  isCurrent: z.boolean(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  os: z.string(),
  browser: z.string(),
  deviceType: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  updatedAt: z.iso.datetime().nullable(),
});

export const list = authedProcedure
  .route({
    method: "GET",
    path: "/devices",
    summary: "List the caller's active devices",
    description:
      "Returns every active Better Auth session for the current user, enriched with parsed OS/browser/device-type for display. The current request's own session is flagged.",
    tags: ["devices"],
  })
  .output(z.object({ devices: z.array(deviceSchema) }))
  .handler(async ({ context }) => {
    const sessions = await auth.api.listSessions({ headers: context.headers });
    const currentId = context.session.session.id;

    return {
      devices: sessions.map((s) => {
        const parsed = parseUserAgent(s.userAgent);
        return {
          sessionId: s.id,
          userId: s.userId,
          isCurrent: s.id === currentId,
          ipAddress: s.ipAddress ?? null,
          userAgent: s.userAgent ?? null,
          os: parsed.os,
          browser: parsed.browser,
          deviceType: parsed.deviceType,
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
        };
      }),
    };
  });

export const revoke = authedProcedure
  .route({
    method: "POST",
    path: "/devices/{sessionId}/revoke",
    summary: "Revoke a specific device",
    description:
      "Invalidates the named Better Auth session token. The user is signed out of that device on their next request.",
    tags: ["devices"],
  })
  .input(z.object({ sessionId: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input }) => {
    await auth.api.revokeSession({
      headers: context.headers,
      body: { token: input.sessionId },
    });
    return { success: true };
  });

export const revokeOthers = authedProcedure
  .route({
    method: "POST",
    path: "/devices/revoke-others",
    summary: "Revoke every device except the current one",
    description: "Signs you out everywhere else. The current session keeps working.",
    tags: ["devices"],
  })
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context }) => {
    await auth.api.revokeOtherSessions({ headers: context.headers });
    return { success: true };
  });
