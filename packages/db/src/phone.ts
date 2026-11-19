import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Phone numbers are PII. We store:
 *  - phone_hash: HMAC-SHA256(pepper, e164) for lookups (caller ID → person)
 *  - phone_enc:  AES-256-GCM(key, e164) so the dialer can call them back
 *  - phone_last4: for masked display
 * Raw numbers never go to logs or the dashboard.
 */

export class PhoneError extends Error {}

/** Normalise to E.164. Nigerian local formats (080…, 80…, 234…) become +234…. */
export function normalizePhone(input: string): string {
  const trimmed = input.trim().replace(/[\s().-]/g, "");
  let digits: string;
  if (trimmed.startsWith("+")) digits = trimmed.slice(1);
  else if (trimmed.startsWith("00")) digits = trimmed.slice(2);
  else if (/^0[789]\d{9}$/.test(trimmed)) digits = `234${trimmed.slice(1)}`;
  else if (/^[789]\d{9}$/.test(trimmed)) digits = `234${trimmed}`;
  else digits = trimmed;
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw new PhoneError(`invalid phone number`);
  return `+${digits}`;
}

function keyFromEnv(name: string, value: string | undefined): Buffer {
  if (!value) throw new Error(`${name} is not set`);
  const buf = Buffer.from(value, "base64");
  if (buf.length !== 32) throw new Error(`${name} must be 32 bytes, base64 encoded`);
  return buf;
}

export interface PhoneCrypto {
  hash(e164: string): string;
  encrypt(e164: string): string;
  decrypt(enc: string): string;
}

export function createPhoneCrypto(pepperB64 = process.env.PHONE_PEPPER, encKeyB64 = process.env.PHONE_ENC_KEY): PhoneCrypto {
  const pepper = keyFromEnv("PHONE_PEPPER", pepperB64);
  const key = keyFromEnv("PHONE_ENC_KEY", encKeyB64);
  return {
    hash(e164) {
      return createHmac("sha256", pepper).update(e164).digest("hex");
    },
    encrypt(e164) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ct = Buffer.concat([cipher.update(e164, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
    },
    decrypt(enc) {
      const [v, ivB64, tagB64, ctB64] = enc.split(".");
      if (v !== "v1" || !ivB64 || !tagB64 || !ctB64) throw new PhoneError("unrecognised phone ciphertext");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
      decipher.setAuthTag(Buffer.from(tagB64, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
    },
  };
}

export function maskPhone(last4: string, e164Prefix = "+234"): string {
  return `${e164Prefix} *** *** ${last4}`;
}

/** Demo contacts use the +234 000 range, which no Nigerian operator assigns. */
export const DEMO_PHONE_PREFIX = "+234000";
export function isDemoNumber(e164: string): boolean {
  return e164.startsWith(DEMO_PHONE_PREFIX);
}
