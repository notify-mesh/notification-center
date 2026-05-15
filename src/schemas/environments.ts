import { z } from "zod";

export const envSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  archivedAt: z.iso.datetime().nullable(),
  settings: z.record(z.string(), z.unknown()),
  maxSendsPerDay: z.number().int().nullable(),
  maxSendsPerMonth: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
});
