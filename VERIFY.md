# Verification map

Live URLs: not deployed yet (brain runs locally behind ngrok during development)
Deploy: Railway (brain, web, Postgres), see ARCHITECTURE.md §14
Start for tests: `npm run build -w @confam/web && npm start -w @confam/web` (port 3100), brain via `npm run dev:brain` (port 8787)

## Critical flows
- Sign in to the control room (ADMIN_EMAIL / ADMIN_PASSWORD from .env); wrong password shows an error
- Pause-all switch: pause shows banner and holds outbound; resume clears it
- Relocation notice: preview counts real vs demo recipients; issue (while paused) logs held attempts; undo
- Settings save; people form validates phone numbers
- Every signed-in page: no console errors, failed requests or horizontal overflow (desktop + mobile)
- Brain: tool auth and allowlists, PU lookup, rumour → verifiers → verdict → callbacks, override with corrections,
  official PIN check-in → go-now alerts, lateness sweep escalation, relocation alerts, dialer guards, signed webhook dedupe
- Live phone checks (manual): call the Confam number, ask about a polling unit, report a rumour, check in as official

## Known non-issues
- `/rumours/<missing id>` renders the not-found page with HTTP 200 (streaming commits status before notFound()); dashboard is noindex
- Headless Chromium without GPU flags renders the MapLibre canvas blank; real browsers and `--use-angle=swiftshader` render it
- `/api/stream` requests show as aborted on navigation: the SSE connection is closed by design
