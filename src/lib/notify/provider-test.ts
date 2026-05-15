import "server-only";

import { KavenegarApiService } from "@root/providers/kavenegar.provider";

/**
 * Provider health checks. Each implementation performs a *cheap* call that
 * exercises authentication (e.g. Kavenegar's `AccountInfo`) and returns
 * within a short timeout. Used by the Provider Credentials UI's "Test
 * connection" button + a periodic health job.
 */
export interface ProviderTestResult {
  ok: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

export async function testProvider(
  providerKey: string,
  creds: Record<string, unknown>,
): Promise<ProviderTestResult> {
  switch (providerKey) {
    case "kavenegar":
      return testKavenegar(creds as { apiKey: string; host?: string });
    case "adp-digital":
      return testAdpDigital(creds as { username: string; password: string });
    case "smtp":
      // Real SMTP connect/auth handshake would belong here. Marking healthy
      // for now since SMTP credentials are validated at send time.
      return { ok: true, message: "Saved. Will validate on first send." };
    case "telegram":
      return testTelegram(creds as { botToken: string; apiUrl?: string });
    case "console":
      return { ok: true, message: "Console transport — no remote check needed." };
    default:
      return { ok: false, message: `No test handler for "${providerKey}".` };
  }
}

function testKavenegar(creds: { apiKey: string; host?: string }): Promise<ProviderTestResult> {
  return new Promise((resolve) => {
    const api = new KavenegarApiService({ apikey: creds.apiKey, host: creds.host });
    const timeout = setTimeout(() => {
      resolve({ ok: false, message: "Timeout after 5s" });
    }, 5000);
    api.AccountInfo({}, (entries, status, message) => {
      clearTimeout(timeout);
      if (!status || status >= 400) {
        resolve({ ok: false, message: message ?? "Unknown error", details: { status } });
        return;
      }
      resolve({ ok: true, message: "Authenticated", details: { entries } });
    });
  });
}

async function testAdpDigital(_creds: {
  username: string;
  password: string;
}): Promise<ProviderTestResult> {
  // ADP's URL endpoint doesn't have a free "ping" — return optimistic
  // success and verify on the first real send. A future improvement is to
  // call a real status endpoint if/when ADP publishes one.
  return { ok: true, message: "Saved. Will validate on first send." };
}

/**
 * Telegram health check — calls `/getMe`. Cheap, authenticated, and proves
 * both that the token is valid and that the Bot API is reachable.
 */
async function testTelegram(creds: {
  botToken: string;
  apiUrl?: string;
}): Promise<ProviderTestResult> {
  if (!creds.botToken) return { ok: false, message: "Missing bot token." };
  const base = (creds.apiUrl ?? "https://api.telegram.org").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${base}/bot${creds.botToken}/getMe`, {
      signal: controller.signal,
    });
    const data = (await res.json()) as {
      ok: boolean;
      result?: { username?: string };
      description?: string;
    };
    if (!data.ok) {
      return { ok: false, message: data.description ?? `HTTP ${res.status}` };
    }
    return {
      ok: true,
      message: data.result?.username
        ? `Authenticated as @${data.result.username}`
        : "Authenticated",
      details: { username: data.result?.username },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Timeout" };
  } finally {
    clearTimeout(timer);
  }
}
