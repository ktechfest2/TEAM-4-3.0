import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { QUEUES, webhookEvent } from "@confam/db";
import type { AppDeps } from "./context.ts";
import { CallerResolver } from "./tools/caller.ts";
import { TOOLS_BY_NAME, type AgentKey } from "./tools/definitions.ts";
import { verifyAethexSignature } from "./webhooks/signature.ts";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

const ToolEnvelope = z.object({
  arguments: z.record(z.string(), z.unknown()).default({}),
  agent_id: z.string().optional(),
  conversation_id: z.string().optional(),
  call_id: z.string().optional(),
});

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function buildApp(deps: AppDeps, opts: { resolver?: CallerResolver } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: deps.log as unknown as FastifyBaseLogger,
    bodyLimit: 1024 * 1024,
    trustProxy: true,
  });

  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    req.rawBody = body as string;
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });

  const resolver = opts.resolver ?? new CallerResolver(deps.aethex, deps.config.CONFAM_LINE_NUMBER);
  const agentIdToKey = new Map<string, AgentKey>(
    Object.entries(deps.config.AETHEX_AGENT_IDS)
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => [v as string, k as AgentKey]),
  );

  app.get("/health", async (_req, reply) => {
    try {
      await deps.db.execute(sql`select 1`);
      return { ok: true, db: "up", time: new Date().toISOString() };
    } catch (err) {
      deps.log.error({ err }, "health check failed");
      return reply.code(503).send({ ok: false, db: "down" });
    }
  });

  app.post<{ Params: { name: string } }>("/tools/:name", async (req, reply) => {
    const key = req.headers["x-confam-tool-key"];
    if (typeof key !== "string" || !safeEqual(key, deps.config.CONFAM_TOOL_KEY)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const tool = TOOLS_BY_NAME.get(req.params.name);
    if (!tool) return reply.code(404).send({ error: "unknown_tool", say: "That action isn't available." });

    const env = ToolEnvelope.safeParse(req.body ?? {});
    if (!env.success) return reply.code(400).send({ error: "bad_envelope", say: "Something went wrong. Please try again." });
    const agentKey = env.data.agent_id ? agentIdToKey.get(env.data.agent_id) : undefined;
    if (!agentKey || !tool.agents.includes(agentKey)) {
      req.log.warn({ tool: tool.name, agentId: env.data.agent_id }, "tool called by agent not on its allowlist");
      return reply.code(403).send({ error: "agent_not_allowed", say: "That action isn't available on this line." });
    }

    const args = tool.schema.safeParse(env.data.arguments);
    if (!args.success) {
      const issues = args.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
      return reply.send({ error: "invalid_arguments", detail: issues, say: "I need a bit more detail to do that. Ask the caller again." });
    }

    const started = Date.now();
    try {
      const party = await resolver.resolve(env.data.call_id).catch((err) => {
        req.log.warn({ err, callId: env.data.call_id }, "could not resolve call party");
        return { phone: null, direction: null } as const;
      });
      const result = await tool.handler(
        args.data,
        { agentKey, callId: env.data.call_id ?? null, conversationId: env.data.conversation_id ?? null, party },
        deps,
      );
      req.log.info({ tool: tool.name, callId: env.data.call_id, ms: Date.now() - started }, "tool ok");
      return reply.send(result);
    } catch (err) {
      req.log.error({ err, tool: tool.name, callId: env.data.call_id }, "tool failed");
      return reply.send({ error: "internal", say: "Sorry, Confam's system is having a problem right now. Apologise and ask them to call back in a few minutes." });
    }
  });

  app.post("/webhooks/aethex", async (req, reply) => {
    const raw = req.rawBody ?? "";
    const sig = verifyAethexSignature(raw, req.headers["x-aethex-signature"] as string | undefined, deps.config.AETHEX_WEBHOOK_SECRET);
    if (!sig.ok) {
      req.log.warn({ reason: sig.reason }, "rejected aethex webhook");
      return reply.code(401).send({ error: "invalid_signature" });
    }
    const type = String(req.headers["x-aethex-event"] ?? (req.body as { type?: string })?.type ?? "unknown");
    const payload = req.body as { event_id?: string };
    const eventId = payload?.event_id;
    if (!eventId) return reply.code(400).send({ error: "missing_event_id" });
    const inserted = await deps.db.insert(webhookEvent).values({ eventId, type }).onConflictDoNothing().returning({ eventId: webhookEvent.eventId });
    if (inserted.length === 0) return reply.send({ ok: true, duplicate: true });
    await deps.jobs.send(QUEUES.webhook, { eventId, type, payload }, { retryLimit: 5, retryDelay: 10, retryBackoff: true });
    return reply.send({ ok: true });
  });

  return app;
}
