import { z } from "zod";
import { PROVIDER_STATUS } from "./common";

export const providerSpecSchema = z.object({
  key: z.string(),
  displayName: z.string(),
  description: z.string(),
  region: z.enum(["ir", "global"]),
  channels: z.array(z.string()),
  implemented: z.boolean(),
  costPerUnitIrr: z.number().optional(),
  fields: z.array(
    z.object({
      name: z.string(),
      secret: z.boolean(),
      type: z.enum(["string", "number", "boolean", "url"]),
      required: z.boolean(),
      description: z.string(),
      placeholder: z.string().optional(),
    }),
  ),
});

export const credentialSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  providerKey: z.string(),
  label: z.string().nullable(),
  status: PROVIDER_STATUS,
  lastTestedAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  /** Masked secrets + plaintext non-secret fields. */
  fields: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
