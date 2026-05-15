import "server-only";

import { telegramTransport } from "@betternotify/telegram";
import type { TelegramMessage, Transport, TransportResult } from "../types";

/**
 * Telegram transport — wraps better-notify's Bot-API client.
 *
 * Telegram's `sendMessage` endpoint accepts exactly one `chat_id` per call,
 * so we fan out across the recipient list and aggregate results. The first
 * failing recipient short-circuits the send (matches the SMS transport's
 * semantics so retry policies behave consistently).
 */
export function createTelegramTransport(input: {
  creds: {
    botToken: string;
    apiUrl?: string;
    defaultParseMode?: "HTML" | "Markdown" | "MarkdownV2";
  };
  channelConfig: { defaultChatId?: string | number };
}): Transport<TelegramMessage> {
  const inner = telegramTransport({
    token: input.creds.botToken,
    apiUrl: input.creds.apiUrl,
  });
  const defaultParseMode = input.creds.defaultParseMode;
  const defaultChatId = input.channelConfig.defaultChatId;

  return {
    providerKey: "telegram",
    channel: "telegram",
    displayName: "Telegram",
    async send(message): Promise<TransportResult> {
      const recipients = normaliseRecipients(message.to, defaultChatId);
      if (recipients.length === 0) {
        throw new Error("Telegram send requires at least one chat_id.");
      }

      const results: Array<{ messageId: number; chatId: string | number }> = [];
      for (const to of recipients) {
        const rendered = {
          to,
          body: message.body,
          parseMode: message.parseMode ?? defaultParseMode,
          attachment: message.attachment,
        };
        // eslint-disable-next-line react-doctor/async-await-in-loop
        const res = await inner.send(rendered, {
          route: "telegram",
          attempt: 1,
          messageId: `nc-${Date.now()}-${results.length}`,
        });
        if (!res.ok) throw res.error;
        results.push({ messageId: res.data.messageId, chatId: res.data.chatId });
      }

      return {
        providerMessageId: results.map((r) => String(r.messageId)).join(","),
        providerStatusCode: 200,
        providerStatusText: "OK",
        status: "sent",
        raw: { results },
      };
    },
  };
}

function normaliseRecipients(
  to: TelegramMessage["to"],
  fallback?: string | number,
): Array<string | number> {
  if (Array.isArray(to)) return to.filter((v) => v !== "" && v !== null && v !== undefined);
  if (to !== "" && to !== null && to !== undefined) return [to];
  if (fallback !== undefined) return [fallback];
  return [];
}
