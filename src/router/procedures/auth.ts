import "server-only";

import { z } from "zod";
import { authedProcedure, publicProcedure, rateLimit } from "@root/lib/orpc";
import { auth } from "@root/lib/auth";
import { userSchema, sessionSchema, requestPasswordResetInput } from "@root/schemas/auth";

export const me = authedProcedure
  .route({
    method: "GET",
    path: "/auth/me",
    summary: "Get the current session",
    description:
      "Returns the authenticated user and a minimal projection of their session. " +
      "Requires the Better Auth session cookie or a bearer token; otherwise responds 401 UNAUTHORIZED.",
    tags: ["auth"],
    successDescription: "Authenticated user + active session.",
  })
  .output(
    z
      .object({
        user: userSchema,
        session: sessionSchema,
      })
      .describe("Caller identity payload."),
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

export const signOut = authedProcedure
  .route({
    method: "POST",
    path: "/auth/sign-out",
    summary: "Sign out of the current session",
    description:
      "Terminates the Better Auth session backing this request. After the response, the session cookie is cleared and subsequent calls require re-authentication.",
    tags: ["auth"],
  })
  .output(z.object({ success: z.boolean().describe("Always true on a 200 response.") }))
  .handler(async ({ context }) => {
    await auth.api.signOut({ headers: context.headers });
    return { success: true };
  });

export const requestPasswordReset = publicProcedure
  .use(rateLimit({ scope: "forgot-password", max: 5, windowSeconds: 15 * 60 }))
  .route({
    method: "POST",
    path: "/auth/forgot-password",
    summary: "Send a password-reset OTP to a phone number",
    description:
      "Triggers Better Auth's `phoneNumber.sendPasswordResetOTP` callback. The response is `{status: true}` regardless of whether the phone is registered — this is intentional, to prevent account enumeration via the public endpoint. Rate-limited to 5 requests per 15 minutes per identifier.",
    tags: ["auth"],
  })
  .input(requestPasswordResetInput)
  .output(
    z.object({
      status: z.boolean().describe("Always true, even for unknown numbers (anti-enumeration)."),
    }),
  )
  .handler(async ({ input, context }) => {
    await auth.api.requestPasswordResetPhoneNumber({
      headers: context.headers,
      body: { phoneNumber: input.phoneNumber },
    });
    return { status: true };
  });
