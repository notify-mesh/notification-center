import { z } from "zod";

export const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  organizationId: z.string().nullable(),
  isBuiltIn: z.boolean(),
  isActive: z.boolean(),
  priority: z.number().int(),
  inheritsFromRoleId: z.string().nullable(),
  permissions: z.array(
    z.object({ action: z.string(), subject: z.string(), inverted: z.boolean() }),
  ),
  createdAt: z.iso.datetime(),
});

export const permissionSchema = z.object({
  id: z.string(),
  action: z.string(),
  subject: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  isBuiltIn: z.boolean(),
});

export const assignmentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
  }),
  roleId: z.string(),
  roleName: z.string(),
  organizationId: z.string().nullable(),
  projectId: z.string().nullable(),
  environmentId: z.string().nullable(),
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
  grantedReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
