import { z } from "zod";

/**
 * Templates use the channel subset that can carry rich content — `slack`
 * and `webhook` aren't templated yet, so they're excluded here.
 */
export const TEMPLATE_CHANNEL = z.enum(["sms", "email", "push", "bale", "telegram"]);
export type TemplateChannel = z.infer<typeof TEMPLATE_CHANNEL>;

export const TEMPLATE_STATUS = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export type TemplateStatus = z.infer<typeof TEMPLATE_STATUS>;

export const variantSchema = z.object({
  id: z.string(),
  channel: TEMPLATE_CHANNEL,
  locale: z.string(),
  version: z.number().int(),
  status: TEMPLATE_STATUS,
  subject: z.string().nullable(),
  html: z.string().nullable(),
  text: z.string().nullable(),
  pushTitle: z.string().nullable(),
  pushBody: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const templateSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  variableSchema: z.record(z.string(), z.unknown()),
  archived: z.boolean(),
  createdAt: z.iso.datetime(),
  variants: z.array(variantSchema),
});
