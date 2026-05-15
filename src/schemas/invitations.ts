import { z } from "zod";

export const INVITATION_ROLE = z.enum(["owner", "admin", "member", "developer", "viewer"]);

export const invitationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.email(),
  role: z.string().nullable(),
  teamId: z.string().nullable(),
  status: z.string(),
  inviterId: z.string(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
