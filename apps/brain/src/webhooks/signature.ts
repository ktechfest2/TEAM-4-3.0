import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies Aethex webhook signatures.
 * Header: X-Aethex-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 * Rejects timestamps more than `toleranceSeconds` from now (replay protection).
 */
export function verifyAethexSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): { ok: true } | { ok: false; reason: string } {
  if (!secret) return { ok: false, reason: "webhook secret not configured" };
  if (!header) return { ok: false, reason: "missing signature header" };
  const parts = new Map(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()] as const;
    }),
  );
  const t = Number(parts.get("t"));
  const v1 = parts.get("v1");
  if (!Number.isFinite(t) || !v1) return { ok: false, reason: "malformed signature header" };
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return { ok: false, reason: "timestamp outside tolerance" };
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  let given: Buffer;
  try {
    given = Buffer.from(v1, "hex");
  } catch {
    return { ok: false, reason: "malformed signature" };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "signature mismatch" };
  return { ok: true };
}

export function signAethexPayload(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")}`;
}
