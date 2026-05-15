import { z } from "zod";

export const apiKeyMethodEnum = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

/**
 * API Key DTO — what we return to the client. The plaintext token is
 * *never* part of this shape; it's only returned by `create()` and `rotate()`.
 */
export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  keyPrefix: z.string(),
  isActive: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  deprecatedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  revokedReason: z.string().nullable(),
  organizationId: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  teamId: z.string().nullable(),
  canRead: z.boolean(),
  canWrite: z.boolean(),
  scopes: z.array(z.string()),
  ipRestrictions: z.array(z.string()),
  countryRestrictions: z.array(z.string()),
  restrictionMode: z.string().nullable(),
  websiteOrigins: z.array(z.string()),
  allowedUserAgents: z.array(z.string()),
  blockedUserAgents: z.array(z.string()),
  allowedMethods: z.array(z.string()),
  requireHttps: z.boolean(),
  minuteQuota: z.number().int().positive().nullable(),
  hourQuota: z.number().int().positive().nullable(),
  dailyQuota: z.number().int().positive().nullable(),
  monthlyQuota: z.number().int().positive().nullable(),
  rateLimitPerSecond: z.number().int().positive().nullable(),
  tags: z.array(z.string()),
  createdAt: z.iso.datetime(),
});

export const createApiKeyInput = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  projectId: z.string(),
  environmentId: z.string(),
  teamId: z.string().nullable().optional(),
  expiresAt: z.iso.datetime().optional(),
  canRead: z.boolean().default(true),
  canWrite: z.boolean().default(false),
  scopes: z.array(z.string()).max(64).default([]),
  ipRestrictions: z.array(z.string().describe("IP or CIDR; v4 or v6")).max(64).default([]),
  countryRestrictions: z
    .array(z.string().regex(/^[A-Z]{2}$/, "ISO-3166-1 alpha-2 country code"))
    .max(250)
    .default([]),
  restrictionMode: z.enum(["allow", "deny"]).default("allow"),
  websiteOrigins: z.array(z.url()).max(64).default([]),
  allowedUserAgents: z.array(z.string()).max(64).default([]),
  blockedUserAgents: z.array(z.string()).max(64).default([]),
  allowedMethods: z.array(apiKeyMethodEnum).default(["GET", "POST"]),
  requireHttps: z.boolean().default(false),
  minuteQuota: z.number().int().positive().optional(),
  hourQuota: z.number().int().positive().optional(),
  dailyQuota: z.number().int().positive().optional(),
  monthlyQuota: z.number().int().positive().optional(),
  rateLimitPerSecond: z.number().int().positive().max(10_000).default(10),
  tags: z.array(z.string().max(40)).max(20).default([]),
});
