/**
 * Minimal typed client for the Aethex REST API (https://developers.aethexai.com/docs/api-reference).
 * Only the endpoints Confam uses. Every request has a timeout; 429/5xx surface as AethexError with retryAfter.
 */

export class AethexError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
    readonly retryAfterSeconds: number | undefined,
    readonly body: unknown,
  ) {
    super(message);
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500 || this.status === 0;
  }
}

export interface AethexCall {
  id: string;
  status?: string;
  direction?: string;
  from_number?: string;
  to_number?: string;
  agent_id?: string;
  metadata?: Record<string, unknown> | null;
  [k: string]: unknown;
}

export interface TriggerCallInput {
  agentId: string;
  toNumber: string;
  fromNumber: string;
  dynamicVariables?: Record<string, string | number | boolean>;
  metadata?: Record<string, unknown>;
}

export interface AethexToolDefinition {
  name: string;
  description: string;
  tool_type: "function";
  parameters_schema: unknown;
  endpoint_url: string;
  http_method: "POST";
  headers: Record<string, string>;
  response_mode: "json";
  timeout_seconds?: number;
}

export interface AethexClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class AethexClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly opts: AethexClientOptions) {
    this.baseUrl = (opts.baseUrl ?? "https://api.aethexai.com/api/v1").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async request<T>(method: string, path: string, body?: unknown, timeoutMs = this.opts.timeoutMs ?? 15_000): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: { "X-API-Key": this.opts.apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new AethexError(`aethex ${method} ${path} failed: ${(err as Error).message}`, 0, "network", undefined, undefined);
    }
    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!res.ok) {
      const p = (parsed ?? {}) as { error?: string; code?: string; detail?: string };
      const retryAfter = Number(res.headers.get("retry-after"));
      throw new AethexError(
        `aethex ${method} ${path} → ${res.status}: ${p.detail ?? p.error ?? String(text).slice(0, 200)}`,
        res.status,
        p.code,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
        parsed,
      );
    }
    return parsed as T;
  }

  triggerCall(input: TriggerCallInput): Promise<AethexCall> {
    return this.request<AethexCall>("POST", "/calls/trigger", {
      agent_id: input.agentId,
      to_number: input.toNumber,
      from_number: input.fromNumber,
      dynamic_variables: input.dynamicVariables,
      metadata: input.metadata,
    });
  }

  /** Opens a real-time WebSocket conversation (used for simulated handsets). */
  connectWebSocketSession(input: {
    agentId: string;
    callerPhone: string;
    dynamicVariables?: Record<string, string | number | boolean>;
  }): Promise<{ session_id: string; ws_url: string }> {
    return this.request("POST", "/conversation/connect", {
      agent_id: input.agentId,
      transport: "websocket",
      audio_format: "pcm_16000",
      direction: "inbound",
      caller_phone: input.callerPhone,
      dynamic_variables: input.dynamicVariables,
    });
  }

  /** The call record Aethex creates for a conversation session (its id is what tools receive as call_id). */
  async findCallForSession(sessionId: string): Promise<AethexCall | null> {
    const res = await this.request<{ data?: AethexCall[] }>("GET", "/calls?limit=25", undefined, 5_000);
    return (res.data ?? []).find((c) => c.conversation_id === sessionId || c.voice_session_id === sessionId) ?? null;
  }

  getCall(callId: string): Promise<AethexCall> {
    return this.request<AethexCall>("GET", `/calls/${encodeURIComponent(callId)}`, undefined, 4_000);
  }

  listAgents(): Promise<{ data: { id: string; name: string }[] }> {
    return this.request("GET", "/agents?limit=100");
  }
  createAgent(body: Record<string, unknown>): Promise<{ id: string }> {
    return this.request("POST", "/agents", body);
  }
  updateAgent(id: string, body: Record<string, unknown>): Promise<{ id: string }> {
    return this.request("PATCH", `/agents/${id}`, body);
  }
  listTools(agentId: string): Promise<{ id: string; name: string }[] | { data: { id: string; name: string }[] }> {
    return this.request("GET", `/agents/${agentId}/tools`);
  }
  createTool(agentId: string, def: AethexToolDefinition): Promise<{ id: string }> {
    return this.request("POST", `/agents/${agentId}/tools`, def);
  }
  updateTool(agentId: string, toolId: string, def: Partial<AethexToolDefinition>): Promise<{ id: string }> {
    return this.request("PATCH", `/agents/${agentId}/tools/${toolId}`, def);
  }
  listVoices(): Promise<{ id: string; name: string; language: string; country: string }[]> {
    return this.request("GET", "/voices");
  }
  rotateWebhookSecret(): Promise<{ secret?: string; webhook_secret?: string; [k: string]: unknown }> {
    return this.request("POST", "/usage/webhook-secret/rotate", {});
  }
}
