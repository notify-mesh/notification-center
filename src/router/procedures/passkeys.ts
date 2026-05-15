import "server-only";

import { z } from "zod";
import { authedProcedure } from "@root/lib/orpc";
import { auth } from "@root/lib/auth";
import { resolveAaguidBatch } from "@root/lib/passkey-aaguid";

const passkeySchema = z.object({
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

/**
 * `GET /passkeys` — list the caller's registered passkeys with vendor info.
 *
 * Better Auth's `auth.api.listPasskeys` returns the raw rows; we enrich each
 * with a `vendor` payload resolved against the FIDO AAGUID catalogue
 * (Redis-backed; see `src/lib/passkey-aaguid.ts`). Icons are inlined as
 * data URIs so the UI can render them without extra round-trips.
 */
export const list = authedProcedure
  .route({
    method: "GET",
    path: "/passkeys",
    summary: "List passkeys for the current user",
    description:
      "Returns every WebAuthn credential registered to the caller. Each row is enriched with a `vendor` block (resolved from AAGUID via the FIDO catalogue) so the UI can show an authenticator label + icon without an additional lookup.",
    tags: ["passkeys"],
  })
  .output(z.object({ passkeys: z.array(passkeySchema) }))
  .handler(async ({ context }) => {
    const rows = await auth.api.listPasskeys({ headers: context.headers });

    const vendors = await resolveAaguidBatch(
      rows.map((r) => ({
        aaguid: r.aaguid ?? null,
        deviceType: r.deviceType,
        backedUp: r.backedUp,
        transports: r.transports ?? null,
      })),
    );

    return {
      passkeys: rows.map((r, i) => {
        const v = vendors[i];
        return {
          id: r.id,
          name: r.name ?? null,
          publicKey: r.publicKey,
          credentialID: r.credentialID,
          counter: r.counter,
          deviceType: r.deviceType,
          backedUp: r.backedUp,
          transports: r.transports ?? null,
          aaguid: r.aaguid ?? null,
          createdAt: r.createdAt ? r.createdAt.toISOString() : null,
          vendor: {
            id: v.id,
            name: v.name,
            kind: v.kind,
            iconLight: v.iconLight,
            iconDark: v.iconDark,
          },
        };
      }),
    };
  });
