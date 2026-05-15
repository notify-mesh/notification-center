import "server-only";

import type { auth } from "@root/lib/auth";
import { headers as nextHeaders } from "next/headers";

type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;

/**
 * Request-scoped context shared by every oRPC procedure.
 *
 * `session` is lazily resolved by middleware so unauthenticated routes
 * don't pay the cost of an `auth.api.getSession` call.
 *
 * `resHeaders` and `reqHeaders` are required to satisfy the corresponding
 * oRPC plugin context shapes; they're injected automatically by
 * `ResponseHeadersPlugin` / `RequestHeadersPlugin`.
 */
export interface ORPCContext {
  headers: Headers;
  session: AuthSession | null;
  ip: string | null;
  resHeaders?: Headers;
  reqHeaders?: Headers;
}

export async function createORPCContext(request?: Request): Promise<ORPCContext> {
  const headers = request?.headers ?? (await nextHeaders());

  return {
    headers,
    session: null,
    ip: extractClientIp(headers),
  };
}

function extractClientIp(headers: Headers): string | null {
  const candidates = [
    "cf-connecting-ip",
    "x-real-ip",
    "x-forwarded-for",
    "x-client-ip",
    "fly-client-ip",
    "fastly-client-ip",
    "true-client-ip",
  ];
  for (const name of candidates) {
    const value = headers.get(name);
    if (value) return value.split(",")[0].trim();
  }
  return null;
}
