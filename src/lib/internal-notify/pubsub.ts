import "server-only";

import { Redis } from "ioredis";

/**
 * Redis pub/sub for internal-notification SSE streams.
 *
 * Why a second Redis client? `redisClient` from `lib/redis.ts` is in normal
 * mode; calling `.subscribe()` on it would block all other commands. We open
 * one dedicated subscriber connection and one dedicated publisher connection
 * (publisher is just `redisClient`, kept separate for clarity).
 *
 * Channel naming
 *   • `nc/internal-notify:user:<userId>`      — per-recipient stream
 *   • `nc/internal-notify:notification:<id>`  — per-notification stream (for the
 *                                                sender's analytics live view)
 *
 * Payload shape
 *   { type: "new" | "read" | "dismissed" | "clicked", notificationId, userId? }
 */

export type InternalNotifyEvent =
  | {
      type: "new";
      notificationId: string;
      userId: string;
      preview: { title: string; severity: string };
    }
  | { type: "read"; notificationId: string; userId: string }
  | { type: "dismissed"; notificationId: string; userId: string }
  | { type: "clicked"; notificationId: string; userId: string };

const PREFIX = "internal-notify";

export function userChannel(userId: string): string {
  return `${PREFIX}:user:${userId}`;
}

export function notificationChannel(id: string): string {
  return `${PREFIX}:notification:${id}`;
}

let publisher: Redis | null = null;
function getPublisher(): Redis {
  if (publisher) return publisher;
  publisher = new Redis({
    connectionName: "NC-Notify-Publisher",
    keyPrefix: "nc/",
    enableAutoPipelining: true,
    lazyConnect: true,
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT!),
    db: process.env.REDIS_DB ? Number(process.env.REDIS_DB) : 0,
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  });
  return publisher;
}

/** Publish an event to every interested channel. */
export async function publishEvent(event: InternalNotifyEvent): Promise<void> {
  const pub = getPublisher();
  const payload = JSON.stringify(event);
  const channels: string[] = [];
  if ("userId" in event && event.userId) channels.push(userChannel(event.userId));
  if (event.notificationId) channels.push(notificationChannel(event.notificationId));
  await Promise.all(channels.map((ch) => pub.publish(ch, payload)));
}

/**
 * Subscribe to events for a specific user. Returns an `AsyncIterable` so it
 * plugs straight into oRPC's event-iterator-style procedure.
 */
export async function* subscribeUserEvents(
  userId: string,
  signal: AbortSignal,
): AsyncGenerator<InternalNotifyEvent> {
  const sub = new Redis({
    connectionName: `NC-Notify-Sub-${userId.slice(0, 8)}`,
    keyPrefix: "nc/",
    lazyConnect: true,
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT!),
    db: process.env.REDIS_DB ? Number(process.env.REDIS_DB) : 0,
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  });
  // ioredis applies the keyPrefix to commands like subscribe — we want it.
  await sub.subscribe(userChannel(userId));

  const queue: InternalNotifyEvent[] = [];
  let resolveNext: ((value: InternalNotifyEvent | null) => void) | null = null;

  sub.on("message", (_channel, message) => {
    try {
      const evt = JSON.parse(message) as InternalNotifyEvent;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r(evt);
      } else {
        queue.push(evt);
      }
    } catch {
      // Malformed payload — drop it.
    }
  });

  const onAbort = () => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r(null);
    }
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (!signal.aborted) {
      if (queue.length > 0) {
        const event = queue.shift();
        if (event) yield event;
        continue;
      }
      const next = await new Promise<InternalNotifyEvent | null>((resolve) => {
        resolveNext = resolve;
      });
      if (next === null) break;
      yield next;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    await sub.unsubscribe().catch(() => {});
    sub.disconnect();
  }
}
