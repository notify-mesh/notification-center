import { z } from "zod";

/**
 * Typed error map shared by every procedure.
 *
 * Each entry becomes both a documented `4xx` response in the generated
 * OpenAPI spec and a strongly-typed `errors.<NAME>(...)` constructor inside
 * the handler — so the client gets `isDefinedError(err) && err.code === ...`
 * narrowing.
 */
export const baseErrors = {
  UNAUTHORIZED: {
    status: 401,
    message: "You must be signed in to perform this action.",
  },
  FORBIDDEN: {
    status: 403,
    message: "You don't have permission to perform this action.",
  },
  NOT_FOUND: {
    status: 404,
    message: "The requested resource was not found.",
  },
  CONFLICT: {
    status: 409,
    message: "The request conflicts with the current state.",
  },
  RATE_LIMITED: {
    status: 429,
    message: "Too many requests. Try again later.",
    data: z.object({
      retryAfterSeconds: z.number().int().positive(),
    }),
  },
  VALIDATION_ERROR: {
    status: 422,
    message: "Input validation failed.",
    data: z.object({
      issues: z.array(z.object({ path: z.array(z.string()), message: z.string() })),
    }),
  },
} as const;
