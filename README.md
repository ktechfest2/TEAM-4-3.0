# Confam

**A phone line anyone can call, from any phone, to check an election rumour.** Callers speak English, Pidgin, Yoruba, Hausa or Igbo, and Confam answers in Pidgin or English. If Confam doesn't already know the answer, it **phones trusted people at that place**, works out a verdict automatically, and **calls the voter back**. It also calls voters when their polling unit moves, chases officials who haven't shown up, and tells elderly and disabled voters when it's time to go.

Built for K-Tech Fest, "Every Vote, Every Voice". Weak link chosen: voter information and misinformation, plus visibility of staff on election day. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design and [docs/research.md](docs/research.md) for the sources behind every decision.

## How it works

```
Voter's phone ──► Telnyx number ──► Aethex voice agent (speech in 5 languages, Claude Sonnet 4.6)
                                          │  custom tools (HTTPS, mid-call)
                                          ▼
                              apps/brain (Fastify + pg-boss workers) ──► Postgres
                                          │  outbound calls: verifiers, callbacks, alerts, late officials
                                          ▼
                              Aethex /calls/trigger ──► Telnyx ──► people on the ground

INEC control room ──► apps/web (Next.js) ──► same Postgres (live via LISTEN/NOTIFY)
```

| Package | What it is |
|---|---|
| `packages/db` | Drizzle schema and migrations, phone encryption (HMAC lookup + AES-256-GCM), Surulere demo seed, shared job names |
| `apps/brain` | Tool endpoints the voice agents call, signed Aethex webhooks, the dialer (single guarded path to outbound calls), verification/alert/lateness workers, agent prompts and provisioning |
| `apps/web` | INEC control room: rumours and verdicts, polling-unit map and relocation notices, people and PINs, call transcripts, pause-all switch, settings |

## Run it locally

Requirements: Node 22+, Docker (Postgres), an Aethex API key, a Telnyx number, and ngrok (so Aethex can reach your machine).

```bash
npm ci
cp .env.example .env            # fill in the values (see below)
docker run -d --name confam-pg -e POSTGRES_USER=confam -e POSTGRES_PASSWORD=confam -e POSTGRES_DB=confam -p 54329:5432 postgres:16-alpine
npm run db:migrate && npm run db:seed
ngrok http 8787                 # put the https URL in PUBLIC_BRAIN_URL
npm run provision:aethex -w @confam/brain -- --write-env --connect-number
npm run dev:brain               # tools, webhooks and workers on :8787
ADMIN_PASSWORD='choose-a-long-one' npm run admin:create -w @confam/web -- you@example.com admin
npm run dev -w @confam/web      # control room on http://localhost:3100
```

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection |
| `AETHEX_API_KEY` | Aethex REST key |
| `AETHEX_WEBHOOK_SECRET` | Written by provisioning (Aethex shows it once) |
| `AETHEX_AGENT_IDS` | JSON map written by provisioning |
| `TELNYX_API_KEY`, `CONFAM_LINE_NUMBER` | Carrier key and the Confam number (E.164) |
| `PUBLIC_BRAIN_URL` | Public HTTPS URL of the brain (tools and webhooks) |
| `CONFAM_TOOL_KEY` | Shared secret Aethex sends on every tool call |
| `PHONE_PEPPER`, `PHONE_ENC_KEY` | 32-byte base64 keys for phone hashing and encryption |
| `AUTH_SECRET` | Dashboard session signing key |
| `DEMO_MODE`, `DEMO_TEAM_PHONES` | In demo mode only these numbers are ever dialled |
| `DEMO_OFFICIAL_PIN` | PIN for the team's polling-official role (seed) |

## Tests

```bash
npm test -w @confam/brain        # 40 unit + integration tests (needs Postgres; TEST_DATABASE_URL)
npm run lint -w @confam/web
npm run build -w @confam/web && npm start -w @confam/web &
npx playwright test -c apps/web  # 16 end-to-end tests, desktop + mobile (ADMIN_EMAIL/ADMIN_PASSWORD)
```

## Safety rules built in

- Verdicts come only from independent verifiers: at least 2 must agree (reputation-weighted, party agents capped). Otherwise the verdict is "unverified".
- The voice agent can only repeat verdict text produced by the system, never its own. It is politically neutral and sends anyone in danger to 112.
- One dialer path, with a pause-all switch, a demo allowlist, cooldowns and quiet hours. Every decision is logged and visible in the control room.
- Phone numbers are encrypted at rest and masked everywhere. No real numbers live in this public repo.
- Voting by phone is out of scope: it's illegal under s.55 of the Electoral Act 2026.
