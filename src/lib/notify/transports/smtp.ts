import "server-only";

import type { EmailMessage, Transport, TransportResult } from "../types";

/**
 * Lightweight SMTP transport stub.
 *
 * In production this would wire up `nodemailer` or `@betternotify/smtp` —
 * we keep the surface compatible so that swapping the body for a real
 * SMTP client is mechanical. For now the transport writes to stdout
 * and returns "queued" so the rest of the pipeline (audit, analytics,
 * UI) can be developed without an SMTP relay.
 */
export function createSmtpTransport(input: {
  creds: { host: string; port: number; user: string; pass: string; from: string; secure?: boolean };
}): Transport<EmailMessage> {
  const { from } = input.creds;

  return {
    providerKey: "smtp",
    channel: "email",
    displayName: "SMTP",
    async send(message): Promise<TransportResult> {
      // eslint-disable-next-line no-console
      console.log(`[notify:email→smtp]`, {
        to: message.to,
        from: message.from ?? from,
        subject: message.subject,
        bytes: message.html?.length ?? message.text?.length ?? 0,
      });
      return {
        providerMessageId: `smtp_${Date.now()}`,
        status: "queued",
        providerStatusText: "Accepted (dev stub)",
      };
    },
  };
}
