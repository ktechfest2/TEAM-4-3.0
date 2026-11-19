import type { AethexClient } from "../aethex/client.ts";

export interface CallParty {
  /** The other party's number (caller for inbound, callee for outbound), or null if unknown (e.g. chat tests). */
  phone: string | null;
  direction: "inbound" | "outbound" | null;
}

/**
 * Resolves who is on the line from Aethex's own call record, never from LLM-supplied arguments
 * (which a caller could manipulate by voice). Cached per call id.
 */
export class CallerResolver {
  private readonly cache = new Map<string, { value: CallParty; at: number }>();
  constructor(
    private readonly aethex: AethexClient,
    private readonly ourNumber: string,
    private readonly ttlMs = 30 * 60_000,
  ) {}

  async resolve(callId: string | undefined | null): Promise<CallParty> {
    if (!callId) return { phone: null, direction: null };
    const hit = this.cache.get(callId);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value;
    const call = await this.aethex.getCall(callId);
    const dir: CallParty["direction"] = call.direction === "inbound" || call.direction === "outbound" ? call.direction : null;
    let phone: string | null;
    if (dir === "inbound") phone = call.from_number ?? null;
    else if (dir === "outbound") phone = call.to_number ?? null;
    else phone = [call.from_number, call.to_number].find((n) => n && n !== this.ourNumber) ?? null;
    const value: CallParty = { phone, direction: dir };
    this.cache.set(callId, { value, at: Date.now() });
    if (this.cache.size > 5000) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    return value;
  }
}
