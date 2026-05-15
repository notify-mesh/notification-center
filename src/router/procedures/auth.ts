import "server-only";

import { z } from "zod";
import { authedProcedure, publicProcedure, rateLimit } from "@root/lib/orpc";
import { auth } from "@root/lib/auth";

/**
 * `GET /me` — returns the currently authenticated user plus session metadata.
 * Public-facing endpoint guarded by `authedProcedure` (throws UNAUTHORIZED
 * with a 401 response when no session cookie is present).
 */
export const me = authedProcedure
  .route({
    method: "GET",
    path: "/auth/me",
    summary: "Get the current session",
    tags: ["auth"],
  })
  .output(
    z.object({
      user: z.object({
        id: z.string(),
        name: z.string(),
        email: z.email(),
        emailVerified: z.boolean(),
        image: z.string().nullable(),
        phoneNumber: z.string().nullable().optional(),
        phoneNumberVerified: z.boolean().nullable().optional(),
        username: z.string().nullable().optional(),
        role: z.string().nullable().optional(),
        twoFactorEnabled: z.boolean().nullable().optional(),
      }),
      session: z.object({
        id: z.string(),
        expiresAt: z.iso.datetime(),
      }),
    }),
  )
  .handler(({ context }) => {
    const { user, session } = context.session;
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image ?? null,
        phoneNumber: (user as { phoneNumber?: string | null }).phoneNumber ?? null,
        phoneNumberVerified:
          (user as { phoneNumberVerified?: boolean | null }).phoneNumberVerified ?? null,
        username: (user as { username?: string | null }).username ?? null,
        role: (user as { role?: string | null }).role ?? null,
        twoFactorEnabled: (user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled ?? null,
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt.toISOString(),
      },
    };
  });

/**
 * `POST /auth/sign-out` — terminates the current session.
 *
 * Better Auth exposes this internally via its own catch-all route, but we
 * also surface it through oRPC so SDK consumers and OpenAPI clients can hit
 * a single, documented endpoint.
 */
export const signOut = authedProcedure
  .route({
    method: "POST",
    path: "/auth/sign-out",
    summary: "Sign out of the current session",
    tags: ["auth"],
  })
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context }) => {
    await auth.api.signOut({ headers: context.headers });
    return { success: true };
  });

/**
 * `POST /auth/forgot-password` — kicks off the phone-based password reset.
 *
 * Rate limited per identifier to slow down enumeration / SMS-cost attacks
 * (5 requests per 15 minutes, regardless of whether the phone exists —
 * Better Auth's `requestPasswordReset` already returns `200` for unknown
 * phones, so callers can't tell either way).
 */
export const requestPasswordReset = publicProcedure
  .use(rateLimit({ scope: "forgot-password", max: 5, windowSeconds: 15 * 60 }))
  .route({
    method: "POST",
    path: "/auth/forgot-password",
    summary: "Send a password-reset OTP to a phone number",
    tags: ["auth"],
  })
  .input(
    z.object({
      phoneNumber: z
        .string()
        .min(8)
        .max(20)
        .regex(/^\+?[0-9]+$/, "Phone number must contain digits only (optional leading +)."),
    }),
  )
  .output(z.object({ status: z.boolean() }))
  .handler(async ({ input, context }) => {
    await auth.api.requestPasswordResetPhoneNumber({
      headers: context.headers,
      body: { phoneNumber: input.phoneNumber },
    });
    return { status: true };
  });
