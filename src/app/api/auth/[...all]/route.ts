import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@root/lib/auth";

/**
 * Better Auth's catch-all route. The plugin set in `src/lib/auth.ts`
 * registers every endpoint (sign-in/email, phone-number/request-password-reset,
 * passkey, organization, etc.) under `/api/auth/*` automatically.
 */
export const { GET, POST } = toNextJsHandler(auth.handler);
