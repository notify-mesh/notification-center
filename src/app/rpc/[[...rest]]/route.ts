import { RPCHandler } from "@orpc/server/fetch";
import { onError, ORPCError } from "@orpc/server";
import {
  BatchHandlerPlugin,
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
 *  - `BatchHandlerPlugin` — unwraps `POST .../__batch__` envelopes shipped
 *    by the client's `BatchLinkPlugin`. Without this the server treats
 *    `__batch__` as a literal procedure segment and 404s every coalesced
 *    call (e.g. multiple `projects.get({id})` from a single render tick).
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
    new BatchHandlerPlugin(),
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
  if (response) return response;

  // oRPC returns no response when the URL hits the bare prefix (no procedure
  // segment). For GET / HEAD on `/rpc` we serve a tiny HTML landing page so
  // the "RPC Endpoint" link in the sidebar doesn't 404. Other verbs without
  // a procedure path are still 404 — that's correct behavior.
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const isIndex = path === "/rpc";
  if (isIndex && (request.method === "GET" || request.method === "HEAD")) {
    return new Response(RPC_INDEX_HTML, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return new Response("Not found", { status: 404 });
}

const RPC_INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RPC endpoint · Notification Center</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      max-width: 720px; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.55;
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #555; }
    @media (prefers-color-scheme: dark) { p { color: #aaa; } }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre {
      background: rgba(127,127,127,.12); padding: 1rem; border-radius: 8px;
      overflow-x: auto; font-size: 0.875rem;
    }
    a { color: inherit; }
    .pill {
      display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px;
      background: rgba(127,127,127,.12); font-size: 0.75rem; margin-right: .25rem;
    }
  </style>
</head>
<body>
  <h1>RPC endpoint</h1>
  <p>
    This is the oRPC handler. It speaks oRPC's wire format, not browsable HTML.
    Use the typed client (<code>@root/lib/orpc/client</code>) or POST procedure
    calls directly here.
  </p>
  <p>
    <span class="pill">POST /rpc/&lt;namespace&gt;/&lt;procedure&gt;</span>
    <span class="pill">JSON body</span>
  </p>
  <pre>curl -X POST \\
  -H "Content-Type: application/json" \\
  -H "Cookie: notification-center.session_token=…" \\
  -d '{}' \\
  http://localhost:3000/rpc/system/health</pre>
  <p>
    For a human-friendly browser, see <a href="/api">/api</a> (Scalar OpenAPI
    reference) or <a href="/api/spec.json">/api/spec.json</a> (raw OpenAPI 3.1).
  </p>
</body>
</html>`;

export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
