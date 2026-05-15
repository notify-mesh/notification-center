/**
 * Name: ADP Digital SMS Provider
 * Type: SMS
 */
import https from "https";
import { URLSearchParams } from "url";

export async function AdpDigitalSmsService(phoneNumber: string, message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      username: process.env.ADPDIGITAL_USERNAME || "",
      password: process.env.ADPDIGITAL_PASSWORD || "",
      dstaddress: `${phoneNumber}`,
      body: message,
      unicode: "1",
    });

    const options = {
      hostname: "ws.adpdigital.com",
      path: `/url/send?${params.toString()}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 15000, // 15 seconds
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        resolve(data);
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
}
