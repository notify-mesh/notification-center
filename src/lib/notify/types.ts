import "server-only";

/**
 * Provider-agnostic transport interface used by the notification orchestrator.
 *
 * Each delivery channel (`sms`, `email`, `bale`, …) ships its own `Transport`
 * implementation. The orchestrator resolves the provider for an (org,
 * project, env, channel), constructs the transport with decrypted creds,
 * then calls `.send(message)`.
 *
 * The shape mirrors better-notify's Transport contract while staying free
 * of any better-notify type coupling — keeps the orchestrator easy to test
 * and lets us swap out the underlying library without rewriting transports.
 */

export type ChannelKind = "sms" | "email" | "push" | "bale" | "telegram" | "slack" | "webhook";

/** Normalised SMS message. */
export interface SmsMessage {
  channel: "sms";
  to: string | string[];
  body: string;
  sender?: string;
  /** Optional template name (Kavenegar `VerifyLookup`). */
  template?: string;
  /** Token map for template-based sends. */
  tokens?: Record<string, string>;
  /** Any provider-specific extras. */
  options?: Record<string, unknown>;
}

/** Normalised Telegram message (bot API). */
export interface TelegramMessage {
  channel: "telegram";
  /** chat_id, channel @username, or numeric chat id. Single or fan-out list. */
  to: string | number | Array<string | number>;
  body: string;
  /** Telegram bot API parse mode. */
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  /** Optional media attachment (photo / document / video / audio). */
  attachment?: {
    type: "photo" | "document" | "video" | "audio";
    url: string;
    caption?: string;
  };
  /** Disable link previews. */
  disableWebPagePreview?: boolean;
  /** Silent notification. */
  disableNotification?: boolean;
}

/** Normalised email message. */
export interface EmailMessage {
  channel: "email";
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  headers?: Record<string, string>;
}

export type NotifyMessage = SmsMessage | EmailMessage | TelegramMessage;

export interface TransportResult {
  /** Provider-assigned id (e.g. Kavenegar messageid). */
  providerMessageId?: string;
  /** Coarse outcome. */
  status: "sent" | "queued" | "failed";
  /** Provider status code as reported. */
  providerStatusCode?: number | string;
  providerStatusText?: string;
  /** Cost in IRR if the provider reports it. */
  cost?: number;
  /** Raw response for the audit trail; redact secrets. */
  raw?: unknown;
}

export interface Transport<TMessage extends NotifyMessage = NotifyMessage> {
  /** Stable provider key (matches `ProviderCredential.providerKey`). */
  providerKey: string;
  /** Which channel this transport delivers. */
  channel: ChannelKind;
  /** Display name for logs / UI. */
  displayName: string;
  send(message: TMessage): Promise<TransportResult>;
}

/**
 * Factory contract — given decrypted creds, build a transport instance.
 * Registered in `./registry.ts`.
 */
export type TransportFactory = (input: {
  creds: Record<string, unknown>;
  channelConfig: Record<string, unknown>;
}) => Transport;
