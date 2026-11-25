# Check Engine

A phone-first Business Model Canvas check from Entrepreneurship for Everyone (UCCS). Someone sketches a venture in nine blocks, starts the engine, and reads the result on a dashboard: a fuel gauge (money), a temperature gauge (hours) and seven warning lights that show where the canvas argues with itself. They change a block and start it again. The companion to From Here to There: that tool plans the route, this one checks whether the vehicle can make the trip.

- `docs/` is the whole site, served by GitHub Pages. No build step for the page.
  - `content.js` holds every word a person sees. Edit it, then bump `?v=` on its script tag in `index.html`.
  - `engine.js` does every calculation (money, hours, the headline, the quote check, the road test math). The AI never does math.
  - `app.js` is the page logic. `config.js` holds the relay address.
- `prompts.js` holds what Claude is told: the checker's rules, the seven pair criteria, and the reply shapes. Run `node build.mjs` after editing it, then redeploy the Worker.
- `worker/` is the Cloudflare Worker relay: passcodes, daily limits, counters only. It holds the API key and runs only three steps (NUMBERS, CHECK, ROAD). It does not log or store what people type.
- No secrets live in this repo. The API key, passcodes and admin token are Worker secrets, set by `set-secrets.sh` from `_local/` (not in the repo).
- Deploy: `.\deploy.ps1` (PowerShell), then `bash set-secrets.sh` the first time or when passcodes change.
- Tests (in `test/`, after `npm install`): `mocktest.mjs` (mocks the relay, screenshots at 390 and 1280 into `_local/`), `words.mjs` (dashes and sentence length), `steadiness.mjs` (runs CHECK on five test canvases; costs money), `live-flow.mjs` (one live pass through the relay; costs money), `live-page.mjs` (loads the live site, no AI calls).
