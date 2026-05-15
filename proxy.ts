import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@root/lib/auth";

/**
 * Edge gate for the admin panel.
 *
 * Everything in this app (except `/sign-in`, `/forgot-password`,
 * `/reset-password`, and the API/RPC handlers) is admin-only. The negative-
 * lookahead matcher below carves out the public surface; everything that
 * survives the matcher hits this proxy and must produce a Better Auth
 * session, otherwise we redirect to `/sign-in` preserving the original URL
 * as `?next=` so users land back where they were after signing in.
 *
 * NOTE: Next.js 16 renamed `middleware.ts` → `proxy.ts`; the named export
 * is `proxy` (formerly `middleware`).
 */
export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    const url = new URL("/sign-in", request.url);
    if (request.nextUrl.pathname !== "/") {
      url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Match everything except:
   *  - the three auth pages
   *  - Better Auth's catch-all (`/api/auth/...`)
   *  - oRPC's RPC handler (`/rpc/...`) and OpenAPI handler (`/api/...`),
   *    which already enforce their own auth via `authedProcedure`
   *  - Next.js internals + public static assets
   */
  matcher: ["/((?!sign-in|forgot-password|reset-password|api/|rpc/|_next/|favicon|.*\\..*).*)"],
};
