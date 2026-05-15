import { z } from "zod";

/**
 * Zod schemas for the auth procedure namespace.
 *
 * Rich `.describe()` annotations are preserved so the generated OpenAPI
 * document teaches consumers what each field means — oRPC's
 * `ZodToJsonSchemaConverter` reads these descriptions and surfaces them
 * in Scalar's UI without us writing any JSON schema by hand.
 */

export const userSchema = z
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

export const sessionSchema = z
  .object({
    id: z.string().describe("Better Auth session id."),
    expiresAt: z.iso
      .datetime()
      .describe("ISO-8601 UTC timestamp at which the session is invalidated."),
  })
  .describe(
    "Compact session metadata. Full session-cookie state lives in Redis and isn't exposed.",
  );

export const requestPasswordResetInput = z.object({
  phoneNumber: z
    .string()
    .min(8)
    .max(20)
    .regex(/^\+?[0-9]+$/, "Phone number must contain digits only (optional leading +).")
    .describe("Target phone in international format, e.g. +989121234567."),
});
