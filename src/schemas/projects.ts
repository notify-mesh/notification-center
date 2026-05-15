import { z } from "zod";

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  organizationId: z.string(),
  isActive: z.boolean(),
  archivedAt: z.iso.datetime().nullable(),
  dataRegion: z.string().nullable(),
  retentionDays: z.number().int(),
  maxSendsPerDay: z.number().int().nullable(),
  maxSendsPerMonth: z.number().int().nullable(),
  settings: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime(),
  environmentCount: z.number().int().nonnegative(),
  apiKeyCount: z.number().int().nonnegative(),
});
