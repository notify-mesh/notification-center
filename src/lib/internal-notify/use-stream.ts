"use client";

import * as React from "react";
import { client } from "@root/lib/orpc/client";

/**
 * Subscribe to the internal-notify SSE stream and invoke `onEvent` for every
 * server-pushed event (new / read / dismissed / clicked / ping).
 *
 * Lifecycle:
 *   • Mounts an async-generator consumer when the component mounts.
 *   • Aborts the stream on unmount.
 *   • Reconnects with exponential backoff (capped at 30s) if the stream errors.
 */
export function useInternalNotifyStream(onEvent: () => void) {
  // Keep the latest callback in a ref so the consumer doesn't restart every
  // time the parent rebinds the handler.
  const handlerRef = React.useRef(onEvent);
  React.useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  React.useEffect(() => {
    let cancelled = false;
    let backoffMs = 1_000;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;

    async function consume() {
      while (!cancelled) {
        try {
          const stream = (await client.internalNotify.stream({})) as AsyncIterable<unknown>;
          backoffMs = 1_000;
          for await (const _event of stream) {
            if (cancelled) return;
            handlerRef.current();
          }
        } catch {
          // Stream closed or failed — back off then retry.
        }
        if (cancelled) return;

        await new Promise<void>((resolve) => {
          pendingTimer = setTimeout(() => {
            pendingTimer = null;
            resolve();
          }, backoffMs);
        });
        backoffMs = Math.min(backoffMs * 2, 30_000);
      }
    }

    void consume();
    return () => {
      cancelled = true;
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, []);
}
