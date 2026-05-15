import type { RouterClient } from "@orpc/server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import {
  BatchLinkPlugin,
  ClientRetryPlugin,
  DedupeRequestsPlugin,
  RetryAfterPlugin,
} from "@orpc/client/plugins";
import type { AppRouter } from "@root/router";

declare global {
  var $client: RouterClient<AppRouter> | undefined;
}

/**
 * Per-call client context — flags consumed by link plugins. Anything you
 * pass as the second argument to a procedure call lands here.
 *
 * Example:
 *   await client.system.health.query(undefined, { context: { skipBatch: true } });
 */
export interface ClientContext {
  /** Skip request batching for this specific call. */
  skipBatch?: boolean;
  /** Skip in-flight deduplication for this specific call. */
  skipDedupe?: boolean;
  /** Override the global retry policy for this call. */
  retry?: number;
}

const link = new RPCLink<ClientContext>({
  url: () => {
    if (typeof window === "undefined") {
      throw new Error("RPCLink is only allowed in the browser.");
    }
    return `${window.location.origin}/rpc`;
  },
  // Forward the auth cookie so Better Auth's `getSession` recognises the user.
  fetch: (req, init) =>
    globalThis.fetch(req, {
      ...init,
      credentials: "include",
    }),
  plugins: [
    /**
     * Retry transient failures (5xx, network errors). Honours `Retry-After`
     * via `RetryAfterPlugin` below — the two plugins compose: retry decides
     * *whether* to retry, retry-after decides *when*.
     */
    new ClientRetryPlugin({
      default: { retry: 2 },
    }),
    new RetryAfterPlugin(),
    /**
     * Collapse identical concurrent requests into one. Useful when multiple
     * components mount and each calls `client.auth.me.query()` on the same tick.
     */
    new DedupeRequestsPlugin({
      filter: ({ request }) => request.method === "GET" || request.method === "HEAD",
      groups: [{ condition: () => true, context: {} }],
    }),
    /**
     * Batch multiple GETs from the same tick into one HTTP roundtrip.
     * RPC handler decodes the batch and dispatches each procedure
     * independently, so authorization is still per-procedure.
     */
    new BatchLinkPlugin({
      groups: [
        {
          condition: ({ context }) => !context.skipBatch,
          context: {},
        },
      ],
    }),
  ],
});

/**
 * Universal client: server code gets the in-process router client via
 * `globalThis.$client` (see `server-client.ts`), browser code falls back to
 * the HTTP link. Same import, same call shape, two execution paths.
 */
export const client: RouterClient<AppRouter, ClientContext> =
  (globalThis.$client as RouterClient<AppRouter, ClientContext> | undefined) ??
  createORPCClient(link);
