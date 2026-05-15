import "server-only";

import { createRouterClient } from "@orpc/server";
import { router } from "@root/router";
import { createORPCContext } from "./context";

/**
 * Installs a singleton router client onto `globalThis` so that the universal
 * `client` import (from `./client`) resolves to a direct in-process call when
 * running on the server (RSCs, route handlers, `generateMetadata`),
 * bypassing HTTP entirely.
 *
 * The global's type is declared in `./client.ts`; here we just assign.
 */
globalThis.$client = createRouterClient(router, {
  context: async () => createORPCContext(),
}) as unknown as typeof globalThis.$client;
