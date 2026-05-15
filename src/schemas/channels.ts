import { z } from "zod";
import { CHANNEL } from "./common";

export const channelSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  channel: CHANNEL,
  providerKey: z.string(),
  isActive: z.boolean(),
  priority: z.number().int(),
  config: z.record(z.string(), z.unknown()),
  dailyCap: z.number().int().nullable(),
  monthlyCap: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
});
