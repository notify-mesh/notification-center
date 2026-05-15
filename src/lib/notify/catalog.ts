import "server-only";

/**
 * Provider catalog — the canonical list of pluggable providers the platform
 * knows how to configure. UI uses this to render forms; transports use it
 * to know which fields are secrets vs plaintext; the credentials vault
 * uses it to decide what to encrypt.
 *
 * Adding a new provider = add an entry here + ship its transport in
 * `./transports/<key>.ts`. No DB migration needed — `ProviderCredential`
 * is `providerKey`-keyed.
 */

import { z } from "zod";

export type ProviderChannel = "sms" | "email" | "push" | "bale" | "telegram" | "slack" | "webhook";

export interface ProviderField {
  name: string;
  /** Hide from API responses; encrypt in DB. */
  secret: boolean;
  type: "string" | "number" | "boolean" | "url";
  required: boolean;
  description: string;
  placeholder?: string;
}

export interface ProviderSpec {
  /** Stable id used as the DB `providerKey`. */
  key: string;
  /** Human label. */
  displayName: string;
  /** Vendor description / region / cost notes. */
  description: string;
  /** Country / regulatory scope hint. */
  region: "ir" | "global";
  /** Which delivery channels this provider can satisfy. */
  channels: ProviderChannel[];
  /** Form schema. */
  fields: ProviderField[];
  /** Default cost (IRR per unit) for analytics. Override via metadata.cost. */
  costPerUnitIrr?: number;
  /** True when the transport implementation is present in the codebase. */
  implemented: boolean;
}

export const PROVIDERS: ReadonlyArray<ProviderSpec> = [
  {
    key: "kavenegar",
    displayName: "Kavenegar",
    description: "Iranian SMS gateway with VerifyLookup support for OTP templates.",
    region: "ir",
    channels: ["sms"],
    implemented: true,
    costPerUnitIrr: 500,
    fields: [
      {
        name: "apiKey",
        secret: true,
        type: "string",
        required: true,
        description: "Kavenegar API key (from the panel under My Account → API).",
        placeholder: "5547…",
      },
      {
        name: "sender",
        secret: false,
        type: "string",
        required: false,
        description: "Default sender line number (e.g. 10004346). Overridable per send.",
        placeholder: "10004346",
      },
      {
        name: "host",
        secret: false,
        type: "string",
        required: false,
        description: "Override the API host (advanced).",
        placeholder: "api.kavenegar.com",
      },
    ],
  },
  {
    key: "adp-digital",
    displayName: "ADP Digital",
    description: "Iranian SMS gateway with Unicode support and bulk delivery.",
    region: "ir",
    channels: ["sms"],
    implemented: true,
    costPerUnitIrr: 450,
    fields: [
      {
        name: "username",
        secret: false,
        type: "string",
        required: true,
        description: "ADP Digital account username.",
      },
      {
        name: "password",
        secret: true,
        type: "string",
        required: true,
        description: "ADP Digital account password.",
      },
    ],
  },
  {
    key: "smtp",
    displayName: "SMTP",
    description: "Any SMTP server — Postfix, Mailgun SMTP, Amazon SES SMTP, etc.",
    region: "global",
    channels: ["email"],
    implemented: true,
    fields: [
      { name: "host", secret: false, type: "string", required: true, description: "SMTP host." },
      {
        name: "port",
        secret: false,
        type: "number",
        required: true,
        description: "SMTP port (587 or 465).",
        placeholder: "587",
      },
      {
        name: "user",
        secret: false,
        type: "string",
        required: true,
        description: "SMTP username.",
      },
      { name: "pass", secret: true, type: "string", required: true, description: "SMTP password." },
      {
        name: "from",
        secret: false,
        type: "string",
        required: true,
        description: "Default from address (RFC 5322).",
        placeholder: "no-reply@example.com",
      },
      {
        name: "secure",
        secret: false,
        type: "boolean",
        required: false,
        description: "Use TLS (`true` for port 465).",
      },
    ],
  },
  {
    key: "bale",
    displayName: "Bale Messenger",
    description: "Iranian messenger; bot-based notifications with rich content.",
    region: "ir",
    channels: ["bale"],
    implemented: false, // wiring stub — full implementation post-MVP
    fields: [
      {
        name: "botToken",
        secret: true,
        type: "string",
        required: true,
        description: "Bale bot token (from @BotFather equivalent on Bale).",
      },
      {
        name: "defaultParseMode",
        secret: false,
        type: "string",
        required: false,
        description: '"HTML" | "Markdown" — applied when the variant doesn\'t set it.',
      },
    ],
  },
  {
    key: "console",
    displayName: "Console (dev only)",
    description: "Writes notifications to stdout. Use for local dev without real credentials.",
    region: "global",
    channels: ["sms", "email", "bale", "push"],
    implemented: true,
    fields: [],
  },
];

/** Lookup helper. */
export function findProvider(key: string): ProviderSpec | undefined {
  return PROVIDERS.find((p) => p.key === key);
}

/**
 * Zod schema for validating credential upserts against a provider's field
 * spec. Built dynamically because each provider has its own shape.
 */
export function buildCredentialZodSchema(spec: ProviderSpec) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of spec.fields) {
    let s: z.ZodType;
    switch (f.type) {
      case "string":
        s = z.string().min(1);
        break;
      case "url":
        s = z.url();
        break;
      case "number":
        s = z.coerce.number();
        break;
      case "boolean":
        s = z.coerce.boolean();
        break;
    }
    if (!f.required) s = s.optional();
    shape[f.name] = s;
  }
  return z.object(shape);
}

/** Partition a credential bundle into `{ secrets, plain }` for sealing. */
export function partitionCredentialFields(
  spec: ProviderSpec,
  values: Record<string, unknown>,
): { secrets: Record<string, string>; plain: Record<string, unknown> } {
  const secrets: Record<string, string> = {};
  const plain: Record<string, unknown> = {};
  for (const f of spec.fields) {
    const v = values[f.name];
    if (v === undefined || v === null || v === "") continue;
    if (f.secret) {
      secrets[f.name] = String(v);
    } else {
      plain[f.name] = v;
    }
  }
  return { secrets, plain };
}
