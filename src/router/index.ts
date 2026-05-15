import "server-only";

import { health } from "./procedures/health";
import { me, signOut, requestPasswordReset } from "./procedures/auth";

/**
 * The single root router. Add new namespaces here as the admin panel grows
 * (`projects`, `apiKeys`, `notifications`, …). Each namespace is a plain
 * object of procedures — no class instances, no implicit registration.
 */
export const router = {
  system: { health },
  auth: { me, signOut, requestPasswordReset },
} as const;

export type AppRouter = typeof router;
