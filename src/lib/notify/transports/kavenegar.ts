import "server-only";

import { KavenegarApiService } from "@root/providers/kavenegar.provider";
import type { SmsMessage, Transport, TransportResult } from "../types";

/**
 * Kavenegar SMS transport.
 *
 * Two send modes:
 *   1. Free-form: `body` is given → uses `Send(receptor, message, sender)`.
 *   2. Pattern (VerifyLookup): `template` + `tokens` → maps to Kavenegar's
 *      token / token2 / token3 / token10 / token20 fields. Required for
 *      OTPs under Iranian regulation.
 *
 * The underlying SDK is callback-based; we wrap it in a Promise here.
 */
export function createKavenegarTransport(input: {
  creds: { apiKey: string; sender?: string; host?: string };
  channelConfig: { sender?: string };
}): Transport<SmsMessage> {
  const api = new KavenegarApiService({
    apikey: input.creds.apiKey,
    host: input.creds.host,
  });
  const defaultSender = input.creds.sender ?? input.channelConfig.sender;

  return {
    providerKey: "kavenegar",
    channel: "sms",
    displayName: "Kavenegar",
    send(message): Promise<TransportResult> {
      const receptor = Array.isArray(message.to) ? message.to.join(",") : message.to;
      const sender = message.sender ?? defaultSender;

      // Pattern-based send (OTPs, transactional templates).
      if (message.template) {
        const tokens = mapKavenegarTokens(message.tokens ?? {});
        return new Promise((resolve, reject) => {
          api.VerifyLookup(
            { receptor, template: message.template!, ...tokens },
            (entries, status, statusText) => {
              if (!status || status >= 400) {
                reject(buildError(entries, status, statusText));
                return;
              }
              const entry = Array.isArray(entries) ? entries[0] : undefined;
              resolve({
                providerMessageId: entry ? String(entry.messageid) : undefined,
                providerStatusCode: status,
                providerStatusText: statusText,
                status: "sent",
                cost: entry?.cost,
                raw: { entries, status, statusText },
              });
            },
          );
        });
      }

      // Free-form send.
      return new Promise((resolve, reject) => {
        api.Send(
          { receptor, message: message.body, sender: sender ?? "" },
          (entries, status, statusText) => {
            if (!status || status >= 400) {
              reject(buildError(entries, status, statusText));
              return;
            }
            const entry = Array.isArray(entries) ? entries[0] : undefined;
            resolve({
              providerMessageId: entry ? String(entry.messageid) : undefined,
              providerStatusCode: status,
              providerStatusText: statusText,
              status: "sent",
              cost: entry?.cost,
              raw: { entries, status, statusText },
            });
          },
        );
      });
    },
  };
}

/**
 * Kavenegar's VerifyLookup expects flat numbered tokens (`token`, `token2`,
 * `token3`, `token10`, `token20`). Map common keys (`code`, `name`, …) to
 * those, preserving any explicit `tokenN` keys the caller provided.
 */
function mapKavenegarTokens(tokens: Record<string, string>): Record<string, string> {
  const VALID = new Set(["token", "token2", "token3", "token10", "token20"]);
  const out: Record<string, string> = {};
  const remaining: string[] = [];

  for (const [k, v] of Object.entries(tokens)) {
    if (VALID.has(k)) out[k] = v;
    else remaining.push(v);
  }
  const SLOTS = ["token", "token2", "token3", "token10", "token20"];
  for (const slot of SLOTS) {
    if (out[slot] !== undefined) continue;
    const next = remaining.shift();
    if (next === undefined) break;
    out[slot] = next;
  }
  return out;
}

function buildError(entries: unknown, status?: number, statusText?: string): Error {
  const reason =
    typeof entries === "string" ? entries : (entries as { error?: string } | undefined)?.error;
  const err = new Error(`Kavenegar SMS failed (${status ?? "n/a"}): ${reason ?? statusText}`);
  Object.assign(err, { providerStatusCode: status, providerStatusText: statusText });
  return err;
}
