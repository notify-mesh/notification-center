import "server-only";

import { z } from "zod";
import { authedProcedure } from "@root/lib/orpc";
import { auth } from "@root/lib/auth";
import { resolveAaguidBatch } from "@root/lib/passkey-aaguid";
import { passkeySchema } from "@root/schemas/passkeys";

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
