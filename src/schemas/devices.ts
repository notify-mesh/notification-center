import { z } from "zod";

export const deviceSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  isCurrent: z.boolean(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  os: z.string(),
  browser: z.string(),
  deviceType: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  updatedAt: z.iso.datetime().nullable(),
});
