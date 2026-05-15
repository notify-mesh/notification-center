/**
 * Name: Kavenegar SMS Provider
 * Type: SMS
 */

import https from "https";
import { stringify as qsStringify } from "querystring";

export interface KavenegarApiOptions {
  apikey: string;
  host?: string;
  version?: string;
}

type Params = Record<string, string | number | boolean | undefined>;

export type KavenegarStatusMessage = {
  status: number;
  message: string;
};

export type KavenegarEntry = {
  messageid: number;
  message: string;
  status: number;
  statustext: string;
  sender: string;
  receptor: string;
  date: number;
  cost: number;
};

export type KavenegarResponseShape = {
  return: KavenegarStatusMessage;
  entries: KavenegarEntry[];
};

// The provider historically calls the callback as (entries, status, message).
// In error cases it may pass a string or an error object as the first argument.
type KavenegarCallbackEntries = KavenegarEntry[] | { error: string } | string | undefined;
type Callback = (entries: KavenegarCallbackEntries, status?: number, message?: string) => void;

export class KavenegarApiService {
  private options: { host: string; version: string; apikey: string };

  constructor(options: KavenegarApiOptions) {
    this.options = {
      host: options.host || "api.kavenegar.com",
      version: options.version || "v1",
      apikey: options.apikey,
    };
  }

  private request(action: string, method: string, params: Params, callback?: Callback): void {
    const path = `/${this.options.version}/${this.options.apikey}/${action}/${method}.json`;
    const postdata = qsStringify(params as Record<string, string | number | boolean>);

    const postOptions: https.RequestOptions = {
      host: this.options.host,
      port: 443,
      path,
      method: "POST",
      headers: {
        "Content-Length": Buffer.byteLength(postdata).toString(),
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
    };

    const req = https.request(postOptions, (res) => {
      res.setEncoding("utf8");
      let result = "";
      res.on("data", (data) => {
        result += data;
      });
      res.on("end", () => {
        try {
          const jsonObject = JSON.parse(result);
          if (callback) {
            callback(jsonObject.entries, jsonObject.return?.status, jsonObject.return?.message);
          }
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
        } catch (e: never) {
          // tslint:disable-next-line:no-console
          console.log("Exception!", e);
          if (callback) {
            callback(e.message, 500);
          }
        }
      });
    });

    req.write(postdata, "utf8");
    req.on("error", (e: Error) => {
      if (callback) {
        callback(JSON.stringify({ error: e.message }));
      }
    });
    req.end();
  }

  public Send(data: Params, callback?: Callback): void {
    this.request("sms", "send", data, callback);
  }

  public SendArray(data: Params, callback?: Callback): void {
    this.request("sms", "sendarray", data, callback);
  }

  public Status(data: Params, callback?: Callback): void {
    this.request("sms", "status", data, callback);
  }

  public VerifyLookup(data: Params, callback?: Callback): void {
    this.request("verify", "lookup", data, callback);
  }

  public AccountInfo(data: Params, callback?: Callback): void {
    this.request("account", "info", data, callback);
  }

  public AccountConfig(data: Params, callback?: Callback): void {
    this.request("account", "config", data, callback);
  }
}

export function createKavenegarApi(options: KavenegarApiOptions): KavenegarApiService {
  return new KavenegarApiService(options);
}

export const kavenegarApi = new KavenegarApiService({
  apikey: process.env.KAVENEGAR_API_KEY || "",
});
