import { z } from "zod";

export const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  organizationId: z.string(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime().nullable(),
  memberCount: z.number().int().nonnegative(),
});

export const createTeamInput = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
});

export const updateTeamInput = z.object({
  teamId: z.string(),
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
});

export const setTeamActiveInput = z.object({
  teamId: z.string(),
  isActive: z.boolean(),
});
