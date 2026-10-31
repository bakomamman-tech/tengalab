# TengaLab Proof Console

A local, presentation-first interface for the **real** TengaLab judge demonstration.

This is not a hosted demo website. It runs on your Ubuntu/WSL machine and is designed to be captured through OBS running on Windows.

## Start

From the complete Git checkout (with the feature/proof-console branch checked out):

1. Run: npm test
2. Confirm Docker: docker --context rootless info
3. Start the dashboard: npm run console
4. Open **http://localhost:4173** in your Windows browser.

If WSL's localhost forwarding is unavailable, resolve it through WSL settings; do not publish this experimental service on a public network.

## What the page shows

- The latest completed **recorded** judge-demo evidence found under your own ~/tengalab-releases/judge-demo-*/ folders, including the proof's SHA-256 sidecar.
- The original source compared against a **previously recorded** Meta Muse Spark 1.3 replacement fixture. It checks the original and replacement digests before enabling the run button.
- A **Run independent verification** button, which executes scripts/judge-demo.sh from the current Git checkout with a stripped-down environment and streams the actual output.
- An explicit reminder that ACCEPT_FIXTURE is **not** proof of general correctness.

The browser does not generate a fresh Meta repair. The recorded proposal was generated earlier through the live Meta API and is being verified offline.

## Demo workflow for OBS

1. Open the dashboard at http://localhost:4173 and enlarge the browser to fill most of the screen.
2. Show the source panels and explain the failure: receiver lag is not necessarily shutdown.
3. Click **Run independent verification**.
4. Narrate the real steps as they appear: automated tests, rootless Docker comparison, evidence check and negative control.
5. End on the results and audit trail. Make clear that the repair has passed the six deterministic fixture checks, not arbitrary production workloads.

## Security and operating boundaries

- The server binds to **127.0.0.1 only**, accepts only localhost Host headers, and requires a same-origin header on POST requests.
- Static web assets are from a fixed allowlist, not arbitrary paths.
- Only a hardcoded, local judge-demo.sh process can run; the browser cannot submit commands, paths or source edits.
- The subprocess environment excludes MODEL_API_KEY, GitHub tokens, and unrelated application secrets.
- The dashboard performs no Meta API calls.
- The dashboard does not deploy the generated repair or change the original source.
- Rootless Docker provides *restricted execution*, not perfect isolation from hostile inputs.
- Keep the repository **private** until a final source review, and revoke any previously exposed API keys.

## Known boundaries

- There is no hosted public URL, account system, database or multi-user collaboration.
- A locally forged evidence record and its checksum can still appear internally consistent. This is not an external attestation service.
- The UI reflects the latest matching locally recorded evidence. A failed new run is marked **FAILED** even if older successful evidence remains in the audit panel.
- The local web console itself is not an additional proof of repair correctness; the independent experiment gate is.

Press **Ctrl+C** in Ubuntu to stop the server.
