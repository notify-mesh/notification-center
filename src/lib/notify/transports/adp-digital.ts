import "server-only";

import { URLSearchParams } from "node:url";
import { request as httpsRequest } from "node:https";
import type { SmsMessage, Transport, TransportResult } from "../types";

/**
 * ADP Digital SMS transport. Uses the simple URL-encoded HTTP API.
 * Free-form send only — ADP doesn't expose a Kavenegar-style template API.
 */
export function createAdpDigitalTransport(input: {
  creds: { username: string; password: string };
}): Transport<SmsMessage> {
  const { username, password } = input.creds;

  return {
    providerKey: "adp-digital",
    channel: "sms",
    displayName: "ADP Digital",
    async send(message): Promise<TransportResult> {
      // ADP supports one recipient per call in its simple URL endpoint;
      // chain calls for arrays so the orchestrator sees one transport call.
      const recipients = Array.isArray(message.to) ? message.to : [message.to];
      const responses: string[] = [];

      for (const dst of recipients) {
        const params = new URLSearchParams({
          username,
          password,
          dstaddress: dst,
          body: message.body,
          unicode: "1",
        });
        // eslint-disable-next-line react-doctor/async-await-in-loop -- ordered fan-out per recipient
        const r = await postForm("/url/send", params);
        responses.push(r);
      }

      return {
        providerStatusText: responses.join(" | "),
        status: "sent",
        raw: { responses },
      };
    },
  };
}

function postForm(path: string, params: URLSearchParams): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: "ws.adpdigital.com",
        path: `${path}?${params.toString()}`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: 15_000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => {
          data += c;
        });
        res.on("end", () => resolve(data));
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("ADP Digital request timed out"));
    });
    req.on("error", reject);
    req.end();
  });
}
