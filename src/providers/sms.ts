import { kavenegarApi, type KavenegarEntry } from "./kavenegar.provider";
import { AdpDigitalSmsService } from "./adp-digital.provider";

/**
 * The active SMS provider, selected via env. Falls back to console-logging
 * when no provider is configured so local dev doesn't depend on a real
 * Iranian SMS gateway.
 */
type Provider = "kavenegar" | "adp-digital" | "console";
const provider = (process.env.SMS_PROVIDER as Provider) || "console";

/**
 * Send a one-time-password to a phone number.
 *
 * Kavenegar's `VerifyLookup` is the recommended way to deliver OTPs in Iran:
 * the message body is built from a pre-approved template (see
 * `KAVENEGAR_OTP_TEMPLATE` env), which avoids carrier filtering and
 * dramatically improves delivery rates compared to a raw send.
 */
export async function sendOtpSms(input: { phoneNumber: string; code: string }): Promise<void> {
  const { phoneNumber, code } = input;
  const purpose = "OTP";

  switch (provider) {
    case "kavenegar":
      return sendViaKavenegar({ receptor: phoneNumber, token: code });
    case "adp-digital": {
      const message = `Notification Center\nYour verification code: ${code}`;
      await AdpDigitalSmsService(phoneNumber, message);
      return;
    }
    case "console":
    default:
      console.log(`[sms:${purpose}] → ${phoneNumber}: ${code}`);
      return;
  }
}

function sendViaKavenegar(params: { receptor: string; token: string }): Promise<void> {
  const template = process.env.KAVENEGAR_OTP_TEMPLATE || "verify";

  return new Promise((resolve, reject) => {
    kavenegarApi.VerifyLookup(
      {
        receptor: params.receptor,
        token: params.token,
        template,
      },
      (entries, status, message) => {
        if (!status || status >= 400) {
          // Kavenegar packs both transport errors and API errors into the
          // same callback shape; surface whichever one is present.
          const reason =
            typeof entries === "string"
              ? entries
              : (entries as { error?: string } | undefined)?.error;
          reject(new Error(`Kavenegar OTP failed (${status ?? "n/a"}): ${reason ?? message}`));
          return;
        }
        resolve();
      },
    );
  }) as Promise<void> & { _entries?: KavenegarEntry[] };
}
