# Verification map

Live URLs:
- Landing page: https://web-production-13f1563e.up.railway.app
- Control room: https://web-production-13f1563e.up.railway.app/control
- Brain (tools/webhooks): https://brain-production-bad753b9.up.railway.app/health

Deploy: Railway project `confam` (services brain, web, Postgres). `railway up --service brain|web --detach` from the repo root;
each service builds its Dockerfile (RAILWAY_DOCKERFILE_PATH). After changing the brain URL, re-run provisioning so Aethex tools point at it.
Start for tests: `npm run build -w @confam/web && npm start -w @confam/web` (port 3100), brain via `npm run dev:brain` (port 8787)

## Critical flows
- Landing page: story renders, call link is tel:, control-room link goes to sign-in, all sections animate (desktop + mobile)
- Sign in to the control room (ADMIN_EMAIL / ADMIN_PASSWORD from .env); wrong password shows an error
- Pause-all switch: pause shows banner and holds outbound; resume clears it
- Relocation notice: preview counts real vs demo recipients; issue (while paused) logs held attempts; undo
- Settings save; people form validates phone numbers
- Every signed-in page: no console errors, failed requests or horizontal overflow (desktop + mobile)
- Brain: tool auth and allowlists, PU lookup, rumour → verifiers → verdict → callbacks, override with corrections,
  official PIN check-in → go-now alerts, lateness sweep escalation, relocation alerts, dialer guards, signed webhook dedupe
- Live phone checks (manual): call the Confam number, ask about a polling unit, report a rumour, check in as official

## Known blockers
- Outbound to Nigeria (+234) needs a Telnyx Level 2 account upgrade (error 10039); then add NG to the `aethex-+1864…` outbound voice profile. Inbound calls are unaffected.

## Known non-issues
- `/rumours/<missing id>` renders the not-found page with HTTP 200 (streaming commits status before notFound()); dashboard is noindex
- Headless Chromium without GPU flags renders the MapLibre canvas blank; real browsers and `--use-angle=swiftshader` render it
- `/api/stream` requests show as aborted on navigation: the SSE connection is closed by design
