import { RPCHandler } from "@orpc/server/fetch";
import { onError, ORPCError } from "@orpc/server";
import {
  CORSPlugin,
  ResponseHeadersPlugin,
  StrictGetMethodPlugin,
  experimental_RethrowHandlerPlugin as RethrowHandlerPlugin,
} from "@orpc/server/plugins";
import { router } from "@root/router";
import { createORPCContext, type ORPCContext } from "@root/lib/orpc";
import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { createUniqueId } from "@root/lib/unique-id";
import { logger } from "@root/lib/logger";

/**
 * The RPC handler exposes the router over oRPC's compact JSON wire format.
 *
 * Plugins (executed in declaration order):
 *  - `CORSPlugin` — allows the admin SPA to talk to the API across origins.
 *  - `ResponseHeadersPlugin` — surfaces `context.resHeaders` to procedures.
 *  - `StrictGetMethodPlugin` — only procedures with `route.method === "GET"`
 *    are reachable via HTTP GET, blocking CSRF-via-image-tag attacks.
 *  - `RethrowHandlerPlugin` — re-throws non-`ORPCError` exceptions so the
 *    Next.js dev overlay shows the real stack trace instead of a generic 500.
 */
const handler = new RPCHandler<ORPCContext>(router, {
  strictGetMethodPluginEnabled: false,
  eventIteratorKeepAliveEnabled: true,
  plugins: [
    new LoggingHandlerPlugin({
      logger,
      generateId: ({ request }) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const prevID = request.headers?.get?.("X-Request-ID") as string;
        return prevID ?? createUniqueId();
      },
      logRequestResponse: true, // Log request start/end (disabled by default)
      logRequestAbort: true, // Log when requests are aborted (disabled by default)
    }),
    new CORSPlugin({
      origin: (origin) => origin,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
      credentials: true,
      exposeHeaders: ["content-type", "content-length"],
    }),
    new ResponseHeadersPlugin(),
    new StrictGetMethodPlugin(),
    new RethrowHandlerPlugin({
      filter: (error) => !(error instanceof ORPCError),
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error("[rpc]", error);
    }),
  ],
});

async function handleRequest(request: Request) {
  const ctx = await createORPCContext(request);

  const { response } = await handler.handle(request, {
    prefix: "/rpc",
    context: ctx,
  });

  return response ?? new Response("Not found", { status: 404 });
}

export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
