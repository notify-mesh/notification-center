import "server-only";

import { z } from "zod";
import { authedProcedure } from "@root/lib/orpc";
import { auth } from "@root/lib/auth";
import { deviceSchema } from "@root/schemas/devices";

/**
 * Filter the "useless" IPs out of the session row.
 *
 * Better Auth captures the IP from forwarded-IP headers when present and
 * falls back to the raw transport `remoteAddress` otherwise. On a localhost
 * dev server listening on `::`, that fallback produces values like `::`,
 * `::1`, `::ffff:127.0.0.1`, or the fully expanded
 * `0000:0000:0000:0000:0000:0000:0000:0000` — all technically valid IPv6
 * but useless for the "where did this session sign in from?" question the
 * Devices page is asking.
 *
 * Strategy: detect the known unusable variants and return `null` so the UI
 * renders its existing `—` placeholder. Real proxy-forwarded IPs (which
 * the actual prod environments will have) pass through untouched.
 */
function normaliseIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  // All-zero IPv6 in any spelling: `::`, `0:0:0:0:0:0:0:0`,
  // `0000:0000:0000:0000:0000:0000:0000:0000`, …
  if (/^[0:]+$/.test(lower)) return null;
  // All-zero IPv4 / unspecified
  if (lower === "0.0.0.0") return null;
  // Loopback in any spelling
  if (lower === "::1" || lower === "127.0.0.1" || lower === "localhost") return null;
  // IPv4-mapped IPv6 forms of zero / loopback
  if (lower === "::ffff:0.0.0.0" || lower === "::ffff:0:0" || lower === "::ffff:127.0.0.1") {
    return null;
  }

  return trimmed;
}

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

    const liveIp = normaliseIp(context.ip);

    return {
      devices: sessions.map((s) => {
        const parsed = parseUserAgent(s.userAgent);
        // For the current session, fall back to the live request IP when the
        // stored value is junk — that's the strongest signal we have about
        // *this* connection.
        const storedIp = normaliseIp(s.ipAddress);
        const ipAddress = storedIp ?? (s.id === currentId ? liveIp : null);
        return {
          sessionId: s.id,
          userId: s.userId,
          isCurrent: s.id === currentId,
          ipAddress,
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
