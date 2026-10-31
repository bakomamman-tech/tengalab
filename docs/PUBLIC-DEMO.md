# TengaLab — Public Render Exhibit

This is a **read-only public website**, separate from the local Proof Console. It makes the verified repair, original code and recorded results accessible to judges with only a browser.

## Security boundary

The public Render site contains **static HTML, CSS, JavaScript and a generated JSON snapshot**. It has:
- No Node server at runtime and no access to the host's local filesystem.
- No `/api/run` endpoint and no ability to run Docker or shell commands.
- No Meta API key or GitHub token.
- No fresh API calls to Meta.
- No claimed external attestation.

The public site uses the original and Meta-generated source from the committed fixture. The builder checks both SHA-256 digests. Its results section transparently describes **a previously recorded local experiment** at source commit `72380e5`; current site changes do not change the experimental result.

## Building

```bash
npm test
npm run build:public
```

Output: `public-dist/` (not committed).

## Render static site settings

- Repository: `https://github.com/bakomamman-tech/tengalab`
- Branch: `feature/public-render-demo` (change to `main` after review)
- Build command: `npm run build:public`
- Publish directory: `public-dist`
- Environment variables: **none**
- Auto deploy: enabled

This is a fully static site. Do not create a public web service that runs `src/console/server.mjs` unless the security model is completely redesigned.

## Local Proof Console

The previous local app remains available via `npm run console` for OBS recording and actual Docker execution. Use `http://localhost:4173` only on your own WSL computer.

## Important evidence limitation

- Original buggy service: 3/6 REJECT.
- Previously recorded Meta-generated repair: 6/6 ACCEPT_FIXTURE.
- Deliberately ineffective modification: 3/6 REJECT.
- Automated tests at experiment time: 68 passing.
- Evidence integrity: checked locally and reported as such, not independently notarized.

`ACCEPT_FIXTURE` means six deterministic test scenarios passed. It is not universal correctness or production certification.

## Public repository review

Before changing GitHub visibility, review all Git history and rotate any credentials that were accidentally exposed. Public GitHub repositories allow anyone to read the code, but this does not grant write access to judges. Judges do not require collaborator invitations for read-only review.
