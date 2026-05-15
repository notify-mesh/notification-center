import { z } from "zod";

export const passkeySchema = z.object({
  id: z.string().describe("Better Auth passkey row id."),
  name: z.string().nullable().describe("User-supplied label."),
  publicKey: z.string().describe("WebAuthn public key in COSE format (base64)."),
  credentialID: z.string().describe("Per-passkey credential id reported by the authenticator."),
  counter: z
    .number()
    .int()
    .describe("Signature counter — bumped each time the credential authenticates."),
  deviceType: z.string().describe("`singleDevice` or `multiDevice` per WebAuthn level 3."),
  backedUp: z
    .boolean()
    .describe("True when the credential is synced via a cloud (iCloud, Google, …)."),
  transports: z
    .string()
    .nullable()
    .describe("Comma-separated allowed transports (`usb,nfc,internal,…`)."),
  aaguid: z.string().nullable().describe("128-bit authenticator make/model identifier."),
  createdAt: z.iso.datetime().nullable(),
  vendor: z
    .object({
      id: z.string().nullable().describe("Lowercased AAGUID, or null when unknown."),
      name: z.string().describe("Friendly authenticator name from the FIDO catalogue."),
      kind: z
        .enum(["platform-synced", "platform-bound", "security-key", "password-manager", "unknown"])
        .describe("Coarse-grained category used by the dashboard."),
      iconLight: z.string().nullable().describe("Data URI of the vendor's light-mode icon."),
      iconDark: z.string().nullable().describe("Data URI of the vendor's dark-mode icon."),
    })
    .describe("Resolved vendor info derived from the AAGUID + WebAuthn metadata."),
});
