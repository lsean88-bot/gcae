import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";

export type ClientConfig = { url: string; token: string; caFile?: string };

export function configFromEnv(env = process.env): ClientConfig {
  return { url: (env.MERIDIAN_URL || "").replace(/\/+$/, ""), token: env.MERIDIAN_TOKEN || "", caFile: env.MERIDIAN_CA_FILE || undefined };
}

export class MeridianError extends Error {}

/**
 * Calls the Meridian HTTPS API with the personal access token. TLS trust comes from NODE_EXTRA_CA_CERTS
 * (read by Node at start-up) or, as an alternative, MERIDIAN_CA_FILE. Certificate checks are never disabled.
 */
export function request(cfg: ClientConfig, method: "GET" | "POST", path: string, query?: Record<string, string | undefined>, body?: unknown): Promise<unknown> {
  if (!cfg.url) return Promise.reject(new MeridianError("MERIDIAN_URL is not set."));
  if (!cfg.token) return Promise.reject(new MeridianError("MERIDIAN_TOKEN is not set. Create a token on the Meridian Account page."));
  let target: URL;
  try {
    target = new URL(`/api/v1/${path}`, cfg.url);
  } catch {
    return Promise.reject(new MeridianError("MERIDIAN_URL is not a valid address."));
  }
  if (target.protocol !== "https:" && !(target.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname))) {
    return Promise.reject(new MeridianError("MERIDIAN_URL must be https:// (http:// is allowed only for localhost). The token would be sent unencrypted."));
  }
  for (const [k, v] of Object.entries(query || {})) if (v) target.searchParams.set(k, v);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const isHttps = target.protocol === "https:";
  const options: https.RequestOptions = {
    method,
    headers: { authorization: `Bearer ${cfg.token}`, accept: "application/json", ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}) },
    timeout: 30_000,
  };
  if (isHttps && cfg.caFile) {
    try {
      options.ca = [...tls.rootCertificates, readFileSync(cfg.caFile, "utf8")];
    } catch {
      return Promise.reject(new MeridianError("MERIDIAN_CA_FILE could not be read."));
    }
  }
  return new Promise((resolve, reject) => {
    const req = (isHttps ? https : http).request(target, options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          /* not JSON */
        }
        const status = res.statusCode || 0;
        if (status >= 200 && status < 300 && parsed) return resolve(parsed);
        const message = parsed && typeof parsed === "object" && "error" in parsed ? String((parsed as { error: unknown }).error) : `Meridian returned HTTP ${status}.`;
        reject(new MeridianError(`${message} (HTTP ${status})`));
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error: NodeJS.ErrnoException) => {
      const code = error.code || error.message;
      const hint = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ISSUER/.test(String(code)) ? " The certificate is not trusted: set NODE_EXTRA_CA_CERTS to the Meridian root CA file." : /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|timeout/.test(String(code)) ? " Check that WARP is connected." : "";
      reject(new MeridianError(`Could not reach Meridian (${code}).${hint}`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}
