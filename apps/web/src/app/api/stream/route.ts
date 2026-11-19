import pg from "pg";
import { EVENTS_CHANNEL } from "@confam/db";
import { getSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events: relays Postgres NOTIFY confam_events to the browser so the control room
 * refreshes the moment a call, verdict or check-in lands. One dedicated LISTEN connection per viewer.
 */
export async function GET(req: Request) {
  if (!(await getSessionUser())) return new Response("Unauthorized", { status: 401 });

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query(`LISTEN ${EVENTS_CHANNEL}`);
  } catch {
    await client.end().catch(() => {});
    return new Response("Live updates unavailable", { status: 503 });
  }

  const enc = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          /* stream already closed */
        }
      };
      send("ready", "{}");
      client.on("notification", (msg) => send("change", msg.payload ?? "{}"));
      client.on("error", () => controller.close());
      heartbeat = setInterval(() => send("ping", String(Date.now())), 25_000);
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        client.end().catch(() => {});
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });
    },
    cancel() {
      clearInterval(heartbeat);
      client.end().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
