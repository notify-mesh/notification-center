import { z } from "zod";

/**
 * Shared enums + primitive shapes used by multiple procedure namespaces.
 *
 * Pure Zod definitions — no runtime side effects, so this module is safe to
 * import from both server and client.
 */

/** Every delivery channel the platform speaks. */
export const CHANNEL = z.enum(["sms", "email", "push", "bale", "telegram", "slack", "webhook"]);
export type Channel = z.infer<typeof CHANNEL>;

/** Provider credential storage state. */
export const PROVIDER_STATUS = z.enum(["UNTESTED", "HEALTHY", "FAILING", "REVOKED"]);

/** Severity used by the activity / audit feeds. */
export const AUDIT_SEVERITY = z.enum(["INFO", "WARN", "CRITICAL"]);

/** Bucket size for analytics timelines. */
export const ANALYTICS_BUCKET = z.enum(["hour", "day", "week"]);
