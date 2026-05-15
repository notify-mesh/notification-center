import "server-only";

import { z } from "zod";
import { authedProcedure, publicProcedure, rateLimit } from "@root/lib/orpc";
import { auth } from "@root/lib/auth";

/**
 * Reusable Zod schemas with rich `.describe()` annotations + examples so the
 * generated OpenAPI document teaches consumers what each field means. oRPC's
 * `ZodToJsonSchemaConverter` reads these `description` strings and surfaces
 * them in Scalar's UI without us writing any JSON schema by hand.
 */
const userSchema = z
  .object({
    id: z.string().describe("Stable user identifier (cuid2)."),
    name: z.string().describe("Display name."),
    email: z.email().describe("Email address. Unique across the platform."),
    emailVerified: z
      .boolean()
      .describe("Whether the email has been confirmed via the verification flow."),
    image: z.string().nullable().describe("URL of the user's avatar, if any."),
    phoneNumber: z
      .string()
      .nullable()
      .optional()
      .describe("E.164-formatted phone number. Used for SMS OTP sign-in and password reset."),
    phoneNumberVerified: z
      .boolean()
      .nullable()
      .optional()
      .describe("Whether the phone has been confirmed via the OTP flow."),
    username: z
      .string()
      .nullable()
      .optional()
      .describe("Optional username for the username sign-in plugin."),
    role: z
      .string()
      .nullable()
      .optional()
      .describe(
        `Platform role. "admin" unlocks adminProcedure endpoints; everything else is treated as a standard user.`,
      ),
    twoFactorEnabled: z.boolean().nullable().optional().describe("TOTP 2FA enrolment status."),
  })
  .describe("Public-facing user shape returned by /auth/me and friends.");

const sessionSchema = z
  .object({
    id: z.string().describe("Better Auth session id."),
    expiresAt: z.iso
      .datetime()
      .describe("ISO-8601 UTC timestamp at which the session is invalidated."),
  })
  .describe(
    "Compact session metadata. Full session-cookie state lives in Redis and isn't exposed.",
  );

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
  .input(
    z.object({
      phoneNumber: z
        .string()
        .min(8)
        .max(20)
        .regex(/^\+?[0-9]+$/, "Phone number must contain digits only (optional leading +).")
        .describe("Target phone in international format, e.g. +989121234567."),
    }),
  )
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
