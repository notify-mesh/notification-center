import "server-only";

import type { ChannelKind, Transport, TransportResult } from "../types";

/**
 * Dev-only transport. Writes everything to stdout and returns success.
 * Picked when an env has no real provider configured for a channel — so
 * local dev "just works".
 */
export function createConsoleTransport(input: { channel: ChannelKind }): Transport {
  return {
    providerKey: "console",
    channel: input.channel,
    displayName: "Console (dev)",
    async send(message): Promise<TransportResult> {
      // Redact obvious secrets before printing (tokens, single-use codes).
      const safe = "tokens" in message ? { ...message, tokens: "<redacted>" } : message;
      // eslint-disable-next-line no-console
      console.log(`[notify:${message.channel}]`, JSON.stringify(safe));
      return {
        providerMessageId: `console_${Date.now()}`,
        providerStatusCode: 200,
        providerStatusText: "OK (console)",
        status: "sent",
        raw: { delivered: true },
      };
    },
  };
}
