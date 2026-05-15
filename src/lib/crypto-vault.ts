import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Envelope-encryption helpers backing `ProviderCredential`.
 *
 * Threat model
 * ------------
 * A DB exfiltration alone must not yield plaintext credentials. The KEK
 * never lives in the DB — it's derived in-process from `BETTER_AUTH_SECRET`
 * via HKDF-SHA256 with a versioned salt+info, so leaking the secret
 * elsewhere (logs, errors) is the only way to compromise the vault.
 *
 * Layout per row
 * --------------
 *   wrappedDek : AES-256-GCM(KEK, DEK)  → base64(iv||ct||tag)
 *   payload    : {
 *     fields: { <name>: AES-256-GCM(DEK, value) → {iv, ct, tag} as base64 }
 *     plain:  { <name>: <non-secret value> }
 *   }
 *
 * Rotation
 * --------
 *  - Bump `KEK_VERSIONS` map below with the new salt; readers accept any
 *    listed version and pick the one matching `row.kekVersion`.
 *  - Lazily re-wrap a row's DEK to the latest version on next read.
 *  - No need to re-encrypt every field — DEKs are 32 bytes, wrapping is
 *    O(rows), not O(rows × fields).
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const DEK_LEN = 32;
const SECRET = process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET || "dev-vault-secret";

/**
 * Salts per KEK version. Adding a new version is the supported rotation
 * path; never overwrite an existing entry.
 */
const KEK_VERSIONS: Record<number, { salt: string; info: string }> = {
  1: { salt: "nc:kek:v1", info: "provider-credentials" },
};

export const CURRENT_KEK_VERSION = 1;

function getKEK(version: number): Buffer {
  const spec = KEK_VERSIONS[version];
  if (!spec) {
    throw new Error(`Unknown KEK version ${version}`);
  }
  // HKDF-SHA256: deterministic 32-byte key per (secret, salt, info).
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(SECRET, "utf8"),
      Buffer.from(spec.salt, "utf8"),
      Buffer.from(spec.info, "utf8"),
      32,
    ),
  );
}

interface SealedField {
  iv: string;
  ct: string;
  tag: string;
}

function sealWithKey(key: Buffer, plaintext: string): SealedField {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function openWithKey(key: Buffer, sealed: SealedField): string {
  const decipher = createDecipheriv(ALGO, key, Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(sealed.ct, "base64")), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Vault payload as persisted in the JSON column.
 *
 * `fields` is the encrypted secret map; `plain` is opaquely-stored
 * non-secret config (host, port, sender prefix, etc.) so a transport
 * doesn't need to consult two columns.
 */
export interface VaultPayload {
  fields: Record<string, SealedField>;
  plain: Record<string, unknown>;
}

/** A row's raw vault material, ready to be stored on `ProviderCredential`. */
export interface SealedRow {
  wrappedDek: string;
  kekVersion: number;
  payload: VaultPayload;
}

/** Decrypted credential bundle — the shape a transport actually consumes. */
export type UnsealedRow = Record<string, unknown>;

function packWrapped(iv: Buffer, ct: Buffer, tag: Buffer): string {
  return Buffer.concat([iv, ct, tag]).toString("base64");
}

function unpackWrapped(b64: string): { iv: Buffer; ct: Buffer; tag: Buffer } {
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  return { iv, ct, tag };
}

/**
 * Seal a credential row.
 *
 * `secrets` are encrypted under a freshly-generated DEK; `plain` is written
 * verbatim. The DEK is wrapped under the current KEK version.
 */
export function sealCredential(input: {
  secrets: Record<string, string>;
  plain?: Record<string, unknown>;
}): SealedRow {
  const dek = randomBytes(DEK_LEN);
  const kek = getKEK(CURRENT_KEK_VERSION);

  // Wrap the DEK with the KEK.
  const dekIv = randomBytes(IV_LEN);
  const dekCipher = createCipheriv(ALGO, kek, dekIv);
  const dekCt = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekTag = dekCipher.getAuthTag();

  // Encrypt each secret field with the DEK.
  const fields: Record<string, SealedField> = {};
  for (const [name, value] of Object.entries(input.secrets)) {
    fields[name] = sealWithKey(dek, value);
  }

  return {
    wrappedDek: packWrapped(dekIv, dekCt, dekTag),
    kekVersion: CURRENT_KEK_VERSION,
    payload: { fields, plain: input.plain ?? {} },
  };
}

/**
 * Unseal a row. Throws if the auth tag fails (tampering) or the KEK
 * version isn't recognised (post-rotation compatibility issue).
 *
 * Returns a *merged* `{ ...plain, ...secrets }` object — the transport
 * doesn't care which fields were encrypted.
 */
export function unsealCredential(input: {
  wrappedDek: string;
  kekVersion: number;
  payload: VaultPayload;
}): UnsealedRow {
  const kek = getKEK(input.kekVersion);
  const { iv, ct, tag } = unpackWrapped(input.wrappedDek);

  const dekDecipher = createDecipheriv(ALGO, kek, iv);
  dekDecipher.setAuthTag(tag);
  const dek = Buffer.concat([dekDecipher.update(ct), dekDecipher.final()]);

  const out: UnsealedRow = { ...input.payload.plain };
  for (const [name, sealed] of Object.entries(input.payload.fields)) {
    out[name] = openWithKey(dek, sealed);
  }
  return out;
}

/**
 * Re-wrap a row's DEK under the latest KEK version. Use this when rotating —
 * cheap (O(1) AES per row), doesn't touch encrypted fields.
 */
export function rotateRowToCurrentKEK(input: { wrappedDek: string; kekVersion: number }): {
  wrappedDek: string;
  kekVersion: number;
} {
  if (input.kekVersion === CURRENT_KEK_VERSION) return input;

  const oldKek = getKEK(input.kekVersion);
  const { iv, ct, tag } = unpackWrapped(input.wrappedDek);
  const dekDecipher = createDecipheriv(ALGO, oldKek, iv);
  dekDecipher.setAuthTag(tag);
  const dek = Buffer.concat([dekDecipher.update(ct), dekDecipher.final()]);

  const newKek = getKEK(CURRENT_KEK_VERSION);
  const newIv = randomBytes(IV_LEN);
  const newCipher = createCipheriv(ALGO, newKek, newIv);
  const newCt = Buffer.concat([newCipher.update(dek), newCipher.final()]);
  const newTag = newCipher.getAuthTag();

  return {
    wrappedDek: packWrapped(newIv, newCt, newTag),
    kekVersion: CURRENT_KEK_VERSION,
  };
}

/** Mask a value for safe display (`sk_abc…xyz`). */
export function maskSecret(value: string, visiblePrefix = 4, visibleSuffix = 4): string {
  if (value.length <= visiblePrefix + visibleSuffix) {
    return "*".repeat(value.length);
  }
  return `${value.slice(0, visiblePrefix)}…${value.slice(-visibleSuffix)}`;
}
