/**
 * Simulated handsets: demo-only phone numbers (SIM_HANDSET_PREFIX, e.g. +234000) that have no SIM card.
 * When the dialer would call one, it opens an Aethex WebSocket conversation with the same agent and
 * variables a real call would get, and parks the session here. A test or recording client that plays the
 * person on that handset collects it from GET /sim/next and holds the conversation over the socket.
 * Everything after that (tools, webhooks, verdicts, alerts) runs through the normal production paths.
 */
export interface SimSession {
  phone: string;
  purpose: string;
  agent: string;
  callId: string;
  sessionId: string;
  wsUrl: string;
  createdAt: number;
}

const TTL_MS = 10 * 60_000;

export class SimHandsets {
  private readonly pending = new Map<string, SimSession[]>();
  constructor(private readonly now: () => number = Date.now) {}

  park(session: Omit<SimSession, "createdAt">): void {
    const list = this.pending.get(session.phone) ?? [];
    list.push({ ...session, createdAt: this.now() });
    this.pending.set(session.phone, list);
  }

  /** Oldest live session waiting for this handset, removed from the queue (a socket can join once). */
  take(phone: string): SimSession | null {
    const list = (this.pending.get(phone) ?? []).filter((s) => this.now() - s.createdAt < TTL_MS);
    const next = list.shift() ?? null;
    if (list.length > 0) this.pending.set(phone, list);
    else this.pending.delete(phone);
    return next;
  }
}
