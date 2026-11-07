import { createHash } from "crypto";

export function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export function shortHash(value: string) {
  return sha256(value).slice(0, 12);
}
