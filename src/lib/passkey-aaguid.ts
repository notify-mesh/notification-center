/**
 * AAGUID resolver — distributed via Redis, sourced from
 * `public/combined_aaguid.json` (FIDO Alliance community DB).
 *
 * Layout
 * ------
 *   In-process Map  →  Redis HASH  →  Disk JSON
 *
 * Cold start: a single instance reads the 6 MB JSON, writes every entry as a
 * field on the `aaguid` Redis hash, and sets `aaguid:warmed` with a 30-day
 * TTL. Other cluster members hit `aaguid:warmed`, skip the file read, and
 * serve directly from Redis. A small `SET NX` lock prevents two instances
 * warming concurrently.
 *
 * Talks to the **ioredis** `Redis` client exported from `./redis.ts`.
 * The client is configured with `keyPrefix: "nc/"`, so every key written
 * here is transparently namespaced — don't prefix it again.
 *
 * The exported surface is intentionally tiny:
 *
 *   • `resolveAaguid(aaguid)`     — resolve one
 *   • `resolveAaguidBatch(ids)`   — resolve many in one HMGET
 *   • `KIND_LABEL`                — human label per `kind`
 */

import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { redisClient } from "./redis";
import { logger } from "@root/lib/logger";

const HASH_KEY = "aaguid";
const WARMED_KEY = "aaguid:warmed";
const LOCK_KEY = "aaguid:warming";
const WARMED_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const LOCK_TTL_SECONDS = 60;

/** Source-of-truth path inside the repo. */
const SOURCE_PATH = join(process.cwd(), "public", "combined_aaguid.json");

/**
 * Shape stored per AAGUID in Redis. We keep the upstream payload (`name`,
 * `icon_light`, `icon_dark`) verbatim and derive a `kind` at read time so we
 * can adjust the categorization rules without re-warming the cache.
 */
interface AaguidEntry {
  name: string;
  /** Base64-encoded SVG/PNG data URI. */
  icon_light?: string;
  /** Base64-encoded SVG/PNG data URI. */
  icon_dark?: string;
}

export type AaguidKind =
  | "platform-synced"
  | "platform-bound"
  | "security-key"
  | "password-manager"
  | "unknown";

export interface ResolvedAaguid {
  /** Lowercased UUID; null when the input was unknown/empty. */
  id: string | null;
  /** Friendly authenticator label (e.g. "Apple iCloud Keychain"). */
  name: string;
  iconLight: string | null;
  iconDark: string | null;
  kind: AaguidKind;
}

export const KIND_LABEL: Record<AaguidKind, string> = {
  "platform-synced": "Synced",
  "platform-bound": "Device-bound",
  "security-key": "Security key",
  "password-manager": "Password manager",
  unknown: "Unknown",
};

/** Tiny in-process cache for hot lookups within the same instance. */
const memo = new Map<string, ResolvedAaguid>();
const MEMO_MAX = 256;

function rememberMemo(id: string, value: ResolvedAaguid): void {
  if (memo.size >= MEMO_MAX) {
    const first = memo.keys().next().value;
    if (first !== undefined) memo.delete(first);
  }
  memo.set(id, value);
}

function isZeroAaguid(id: string): boolean {
  return id === "" || id === "00000000-0000-0000-0000-000000000000";
}

function normalize(aaguid: string | null | undefined): string {
  return (aaguid ?? "").trim().toLowerCase();
}

/**
 * Derive a kind category from the authenticator name + WebAuthn metadata.
 * Pure heuristic — kept here so we can tweak rules without re-warming Redis.
 */
function deriveKind(input: {
  name: string;
  deviceType?: string | null;
  backedUp?: boolean | null;
  transports?: string | null;
}): AaguidKind {
  const n = input.name.toLowerCase();
  if (/\b(yubikey|titan|solokey|feitian|onlykey|nitrokey|trezor|ledger|cryptnox)\b/.test(n))
    return "security-key";
  if (/\b(1password|dashlane|bitwarden|nordpass|keepass|enpass|proton pass|lastpass)\b/.test(n))
    return "password-manager";
  if (/\b(icloud keychain|google password manager|samsung pass|microsoft account)\b/.test(n))
    return "platform-synced";
  if (/\b(windows hello|touch id|face id|android safetynet|chromeos)\b/.test(n))
    return "platform-bound";

  const transports = (input.transports ?? "").toLowerCase();
  if (transports.includes("usb") || transports.includes("nfc")) return "security-key";
  if (input.backedUp) return "platform-synced";
  if (input.deviceType && input.deviceType !== "multiDevice") return "platform-bound";
  return "unknown";
}

function toResolved(
  id: string | null,
  entry: AaguidEntry | null,
  hints?: { deviceType?: string | null; backedUp?: boolean | null; transports?: string | null },
): ResolvedAaguid {
  if (!entry) {
    if (hints?.backedUp) {
      return {
        id,
        name: "Synced passkey",
        iconLight: null,
        iconDark: null,
        kind: "platform-synced",
      };
    }
    if (hints?.transports && /usb|nfc/i.test(hints.transports)) {
      return {
        id,
        name: "Hardware security key",
        iconLight: null,
        iconDark: null,
        kind: "security-key",
      };
    }
    return {
      id,
      name: "Unknown authenticator",
      iconLight: null,
      iconDark: null,
      kind: hints && hints.deviceType !== "multiDevice" ? "platform-bound" : "unknown",
    };
  }
  return {
    id,
    name: entry.name,
    iconLight: entry.icon_light ?? null,
    iconDark: entry.icon_dark ?? null,
    kind: deriveKind({
      name: entry.name,
      deviceType: hints?.deviceType,
      backedUp: hints?.backedUp,
      transports: hints?.transports,
    }),
  };
}

/**
 * Lazily warm: ensure Redis has the AAGUID table. Cheap on the hot path
 * (just a `GET aaguid:warmed`) and idempotent — multiple instances racing
 * here is fine because the second one sees the flag and bails.
 *
 * Uses ioredis's canonical modifier ordering `(key, value, "EX", seconds,
 * "NX")` which gives the tightest TypeScript overload and matches the
 * library's own tests.
 */
async function ensureWarmed(): Promise<void> {
  const warmed = await redisClient.get(WARMED_KEY);
  if (warmed) return;

  const lock = await redisClient.set(LOCK_KEY, "1", "EX", LOCK_TTL_SECONDS, "NX");
  if (lock !== "OK") {
    // Someone else is warming — back off briefly so later calls hit the
    // warmed flag.
    await new Promise((r) => setTimeout(r, 250));
    return;
  }

  try {
    const json = await readFile(SOURCE_PATH, "utf-8");
    const parsed = JSON.parse(json) as Record<string, AaguidEntry>;

    // `HSET key field value [field value …]` in batches so we don't ship one
    // giant command. ioredis accepts a `Record<string, string>` object form
    // and serialises it internally — same wire shape as raw multi-field HSET.
    const entries = Object.entries(parsed);
    const BATCH = 200;
    for (let i = 0; i < entries.length; i += BATCH) {
      const slice = entries.slice(i, i + BATCH);
      const fields: Record<string, string> = {};
      for (const [id, entry] of slice) {
        fields[id.toLowerCase()] = JSON.stringify(entry);
      }
      // eslint-disable-next-line react-doctor/async-await-in-loop
      await redisClient.hset(HASH_KEY, fields);
    }

    await redisClient.set(WARMED_KEY, String(entries.length), "EX", WARMED_TTL_SECONDS);
  } catch (e) {
    logger.error(e, "[aaguid] warm failed:");
  } finally {
    await redisClient.del(LOCK_KEY);
  }
}

/**
 * Resolve a single AAGUID to a friendly DTO. Always returns *something* —
 * unknown/empty IDs fall back to a generic descriptor derived from `hints`.
 */
export async function resolveAaguid(
  aaguid: string | null | undefined,
  hints?: { deviceType?: string | null; backedUp?: boolean | null; transports?: string | null },
): Promise<ResolvedAaguid> {
  const id = normalize(aaguid);

  if (isZeroAaguid(id)) {
    return toResolved(null, null, hints);
  }

  const memoKey = `${id}|${hints?.deviceType ?? ""}|${hints?.backedUp ?? ""}|${hints?.transports ?? ""}`;
  const cached = memo.get(memoKey);
  if (cached) return cached;

  await ensureWarmed();

  // ioredis `hmget` is variadic — fields go in as rest args. Passing an
  // array (`hmget(key, [id])`) would coerce via `Array.prototype.toString`
  // and Redis would receive the literal string "id" as a single field name,
  // returning `[null]`. Either spread or use `hget` for single lookups.
  const raw = await redisClient.hget(HASH_KEY, id);
  const entry: AaguidEntry | null = raw ? safeParse(raw) : null;
  const resolved = toResolved(id, entry, hints);

  rememberMemo(memoKey, resolved);
  return resolved;
}

/**
 * Resolve many AAGUIDs in a single `HMGET` round-trip. Preserves input order.
 */
export async function resolveAaguidBatch(
  ids: ReadonlyArray<{
    aaguid: string | null | undefined;
    deviceType?: string | null;
    backedUp?: boolean | null;
    transports?: string | null;
  }>,
): Promise<ResolvedAaguid[]> {
  if (ids.length === 0) return [];

  const lookupSlots: Array<{ originalIndex: number; id: string }> = [];
  const results: (ResolvedAaguid | undefined)[] = new Array(ids.length).fill(undefined);

  ids.forEach((entry, i) => {
    const id = normalize(entry.aaguid);
    if (isZeroAaguid(id)) {
      results[i] = toResolved(null, null, entry);
      return;
    }
    lookupSlots.push({ originalIndex: i, id });
  });

  if (lookupSlots.length > 0) {
    await ensureWarmed();
    // Spread the fields into ioredis's variadic `hmget(key, ...fields)`.
    const raws = await redisClient.hmget(HASH_KEY, ...lookupSlots.map((s) => s.id));
    raws.forEach((raw, k) => {
      const slot = lookupSlots[k];
      const entry: AaguidEntry | null = raw ? safeParse(raw) : null;
      results[slot.originalIndex] = toResolved(slot.id, entry, ids[slot.originalIndex]);
    });
  }

  return results as ResolvedAaguid[];
}

function safeParse(s: string): AaguidEntry | null {
  try {
    const parsed = JSON.parse(s) as AaguidEntry;
    if (parsed && typeof parsed.name === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}
