import "server-only";

import { createHmac, randomBytes } from "node:crypto";

/**
 * Server pepper for HMAC-SHA256(token) → keyHash.
 *
 * Stored separately from the database so a DB leak alone is insufficient to
 * reverse the lookup. Falls back to `SESSION_SECRET` so dev environments
 * just work without extra wiring.
 */
const PEPPER = process.env.API_KEY_PEPPER || process.env.SESSION_SECRET || "dev-pepper";

const PREFIX_LENGTH = 8;
const SECRET_BYTES = 24; // 192 bits — base64url ≈ 32 chars

/**
 * Mint a fresh API key. Returns:
 *   - `token`     : the full plaintext (`nc_<env>_<prefix><secret>`) shown ONCE
 *   - `keyPrefix` : the publicly-visible prefix (first 8 chars) for masked UI
 *   - `keyHash`   : HMAC-SHA256(token, pepper) — what we actually persist
 *
 * The token format starts with `nc_` so it's easy to detect in logs/leaks.
 */
export function mintApiKey(environmentName: string): {
  token: string;
  keyPrefix: string;
  keyHash: string;
} {
  const envSlug = environmentName.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "live";
  const random = randomBytes(SECRET_BYTES).toString("base64url");
  const token = `nc_${envSlug}_${random}`;
  const keyPrefix = token.slice(0, PREFIX_LENGTH);
  const keyHash = createHmac("sha256", PEPPER).update(token).digest("hex");
  return { token, keyPrefix, keyHash };
}

/** Mask a key for display (`nc_live_xxxxxxxx****abcd`). */
export function maskApiKey(prefix: string, last4 = "xxxx"): string {
  return `${prefix}…${last4}`;
}
