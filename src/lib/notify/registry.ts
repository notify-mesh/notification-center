import "server-only";

import { createKavenegarTransport } from "./transports/kavenegar";
import { createAdpDigitalTransport } from "./transports/adp-digital";
import { createConsoleTransport } from "./transports/console";
import { createSmtpTransport } from "./transports/smtp";
import type { ChannelKind, NotifyMessage, Transport, TransportFactory } from "./types";

/**
 * Provider-key → transport-factory map.
 *
 * Each factory takes the decrypted credentials + the channel's `config`
 * blob and returns a ready-to-call `Transport`. Adding a provider = drop
 * a transport in `./transports/` and register it here. Nothing else
 * changes (the catalog, vault, and orchestrator all key off this map).
 */
const REGISTRY: Record<string, TransportFactory> = {
  kavenegar: (input) =>
    createKavenegarTransport({
      creds: input.creds as { apiKey: string; sender?: string; host?: string },
      channelConfig: input.channelConfig as { sender?: string },
    }) as Transport<NotifyMessage>,

  "adp-digital": (input) =>
    createAdpDigitalTransport({
      creds: input.creds as { username: string; password: string },
    }) as Transport<NotifyMessage>,

  smtp: (input) =>
    createSmtpTransport({
      creds: input.creds as {
        host: string;
        port: number;
        user: string;
        pass: string;
        from: string;
        secure?: boolean;
      },
    }) as Transport<NotifyMessage>,
};

/**
 * Resolve a transport for a (providerKey, channel) pair.
 *
 * When no real transport is configured, fall back to a console transport
 * so dev environments don't crash on missing credentials. Production
 * deploys should fail loudly instead — gate with `STRICT_NOTIFY=1`.
 */
export function getTransport(input: {
  providerKey: string;
  channel: ChannelKind;
  creds: Record<string, unknown>;
  channelConfig: Record<string, unknown>;
}): Transport {
  const factory = REGISTRY[input.providerKey];
  if (factory) {
    return factory({ creds: input.creds, channelConfig: input.channelConfig });
  }

  if (process.env.STRICT_NOTIFY === "1") {
    throw new Error(
      `No transport registered for provider "${input.providerKey}". Add one in src/lib/notify/registry.ts.`,
    );
  }
  return createConsoleTransport({ channel: input.channel });
}
