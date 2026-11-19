/**
 * Idempotently provisions Confam on Aethex:
 *   1. four agents (hotline, verifier, alert, official) with prompts, voices, guardrails, webhook
 *   2. each agent's tools, generated from the same Zod schemas the brain validates with
 *   3. the account webhook secret (only if AETHEX_WEBHOOK_SECRET is empty)
 *   4. optionally (--connect-number) links the Telnyx account and routes CONFAM_LINE_NUMBER to the hotline
 *
 * Usage: npm run provision:aethex -- [--write-env] [--connect-number]
 * Requires AETHEX_API_KEY, PUBLIC_BRAIN_URL, CONFAM_TOOL_KEY (and TELNYX_API_KEY + CONFAM_LINE_NUMBER for --connect-number).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { AethexClient, AethexError, type AethexToolDefinition } from "../src/aethex/client.ts";
import {
  ALERT_PROMPT,
  FIRST_MESSAGES,
  HOTLINE_PROMPT,
  NEUTRALITY_GUARDRAIL,
  OFFICIAL_PROMPT,
  PROMPT_VERSION,
  VERIFIER_PROMPT,
  VOICEMAIL_MESSAGE,
} from "../src/prompts/index.ts";
import { TOOLS, type AgentKey } from "../src/tools/definitions.ts";

const args = new Set(process.argv.slice(2));
const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is required`);
  return v;
};

const apiKey = env("AETHEX_API_KEY");
const brainUrl = env("PUBLIC_BRAIN_URL").replace(/\/$/, "");
const toolKey = env("CONFAM_TOOL_KEY");
const aethex = new AethexClient({ apiKey, baseUrl: process.env.AETHEX_BASE_URL, timeoutMs: 30_000 });
const LLM = process.env.AETHEX_LLM_MODEL ?? "claude-haiku-4-5";

const voices = await aethex.listVoices();
const voice = (name: string) => {
  const v = voices.find((x) => x.name === name && x.country === "NG" && x.language === "english");
  if (!v) throw new Error(`voice ${name} not found`);
  return v.id;
};
const FEMALE = voice(process.env.CONFAM_VOICE_FEMALE ?? "Ifeoma");

const common = {
  language: "english",
  llm_model: LLM,
  temperature: 0.3,
  interruption_enabled: true,
  turn_eagerness: "eager",
  response_max_sentences: 2,
  end_call_enabled: true,
  recording_enabled: true,
  transcription_enabled: true,
  keypad_capture_enabled: true,
  focus_guardrail_enabled: true,
  crisis_guardrail_enabled: true,
  custom_guardrails: [NEUTRALITY_GUARDRAIL],
  webhook_url: `${brainUrl}/webhooks/aethex`,
  metadata: { app: "confam", prompt_version: PROMPT_VERSION },
};

const SPECS: Record<AgentKey, Record<string, unknown>> = {
  hotline: { ...common, name: "confam-hotline", system_prompt: HOTLINE_PROMPT, messaging_system_prompt: HOTLINE_PROMPT, first_message: FIRST_MESSAGES.hotline, voice_id: FEMALE, max_duration_seconds: 600, idle_check_in_after_secs: 12 },
  verifier: { ...common, name: "confam-verifier", system_prompt: VERIFIER_PROMPT, messaging_system_prompt: VERIFIER_PROMPT, first_message: FIRST_MESSAGES.verifier, voice_id: FEMALE, max_duration_seconds: 180, script_adherence: "strict" },
  alert: {
    ...common,
    name: "confam-alert",
    system_prompt: ALERT_PROMPT, messaging_system_prompt: ALERT_PROMPT,
    first_message: FIRST_MESSAGES.alert,
    voice_id: FEMALE,
    max_duration_seconds: 240,
    script_adherence: "strict",
    voicemail_detection_enabled: true,
    voicemail_action: "leave_message",
    voicemail_message: VOICEMAIL_MESSAGE,
  },
  official: { ...common, name: "confam-official", system_prompt: OFFICIAL_PROMPT, messaging_system_prompt: OFFICIAL_PROMPT, first_message: FIRST_MESSAGES.official, voice_id: FEMALE, max_duration_seconds: 300 },
};

function toolSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

const updates: Record<string, string> = {};
/** Persist updates to the repo-root .env (only with --write-env). Called right after the secret is minted, since Aethex shows it once. */
function writeEnv() {
  if (!args.has("--write-env")) return;
  const path = resolve(import.meta.dirname, "../../../.env");
  let text = readFileSync(path, "utf8");
  for (const [k, v] of Object.entries(updates)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  }
  writeFileSync(path, text);
  console.log(`updated ${path}`);
}

if (!process.env.AETHEX_WEBHOOK_SECRET) {
  const rotated = await aethex.rotateWebhookSecret();
  const secret = String(rotated.webhook_secret ?? rotated.secret ?? "");
  if (!secret) throw new Error(`unexpected rotate response: ${JSON.stringify(rotated)}`);
  updates.AETHEX_WEBHOOK_SECRET = secret;
  writeEnv();
  console.log("rotated account webhook secret");
}

const existingAgents = (await aethex.listAgents()).data;
const ids: Record<string, string> = {};

for (const [key, spec] of Object.entries(SPECS) as [AgentKey, Record<string, unknown>][]) {
  const found = existingAgents.find((a) => a.name === spec.name);
  let id: string;
  if (found) {
    await aethex.updateAgent(found.id, spec);
    id = found.id;
    console.log(`updated agent ${spec.name} (${id})`);
  } else {
    id = (await aethex.createAgent(spec)).id;
    console.log(`created agent ${spec.name} (${id})`);
  }
  ids[key] = id;

  const listed = await aethex.listTools(id);
  const existingTools = Array.isArray(listed) ? listed : (listed.data ?? []);
  for (const t of TOOLS.filter((x) => x.agents.includes(key))) {
    const def: AethexToolDefinition = {
      name: t.name,
      description: t.description,
      tool_type: "function",
      parameters_schema: toolSchema(t.schema),
      endpoint_url: `${brainUrl}/tools/${t.name}`,
      http_method: "POST",
      // {{system__caller_id}} is filled by Aethex with the other party's number, saving a lookup per call.
      headers: { "x-confam-tool-key": toolKey, "x-confam-caller": "{{system__caller_id}}" },
      response_mode: "json",
    };
    const ex = existingTools.find((x) => x.name === t.name);
    if (ex) await aethex.updateTool(id, ex.id, def);
    else await aethex.createTool(id, def);
    console.log(`  ${ex ? "updated" : "created"} tool ${t.name}`);
  }
  // Remove tools this agent should no longer have (e.g. after a tool is retired).
  const wanted = new Set(TOOLS.filter((x) => x.agents.includes(key)).map((x) => x.name));
  for (const ex of existingTools.filter((x) => !wanted.has(x.name))) {
    await aethex.request("DELETE", `/agents/${id}/tools/${ex.id}`);
    console.log(`  removed tool ${ex.name}`);
  }
}

updates.AETHEX_AGENT_IDS = JSON.stringify(ids);
writeEnv();


if (args.has("--connect-number")) {
  const number = env("CONFAM_LINE_NUMBER");
  const carriers = await aethex.request<{ data: { id: string; provider: string; status: string }[] }>("GET", "/integrations/telephony/carriers");
  let carrierId = carriers.data.find((c) => c.provider === "telnyx" && c.status === "active")?.id;
  if (!carrierId) {
    const linked = await aethex.request<{ id: string }>("POST", "/integrations/telephony/carriers", { provider: "telnyx", api_key: env("TELNYX_API_KEY"), label: "Confam Telnyx" });
    carrierId = linked.id;
    console.log(`linked Telnyx carrier account (${carrierId})`);
  }
  try {
    const res = await aethex.request<Record<string, unknown>>("POST", `/integrations/telephony/carriers/${carrierId}/connect`, { phone_number: number, agent_id: ids.hotline });
    console.log(`connected ${number} → confam-hotline:`, JSON.stringify(res));
  } catch (err) {
    if (err instanceof AethexError && err.status === 409) {
      console.log(`${number} is already connected; updating its routing to the hotline agent`);
      const nums = await aethex.request<{ data: { id: string; phone_number?: string; number?: string }[] }>("GET", "/phone-numbers");
      const n = nums.data.find((x) => (x.phone_number ?? x.number) === number);
      if (n) await aethex.request("PATCH", `/phone-numbers/${n.id}`, { agent_id: ids.hotline });
    } else throw err;
  }
}

console.log("\nset these in the brain's environment:");
for (const [k, v] of Object.entries(updates)) console.log(`${k}=${k === "AETHEX_WEBHOOK_SECRET" ? "<written to .env>" : v}`);

writeEnv();
