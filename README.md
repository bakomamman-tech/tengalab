# TengaLab

### Don't trust the patch. Prove it.

**AI-generated software repair with independent experimental verification.**

TengaLab is an experimental software reliability laboratory built for the Meta Global AI Developer Hackathon 2026, Startup Track.

It uses Meta Muse Spark 1.3 to investigate a software defect and generate a replacement source file. A separate verification harness evaluates the generated code against predefined behavioral invariants.

## Verified results

| Candidate | Tests passed | Verdict |
|---|---:|---|
| Original buggy source | 3/6 | REJECT |
| Meta Muse-generated repair | 6/6 | ACCEPT_FIXTURE |
| Ineffective source modification | 3/6 | REJECT |

**65 automated regression tests passed** in the latest verified development run.

The model-generated repair was produced during a live Meta API experiment and packaged as a reproducible offline demonstration fixture.

## Why TengaLab?

An AI-generated patch may look convincing without fixing the underlying defect.

TengaLab separates the repair proposal from its acceptance decision:

1. Investigate a reproducible failure.
2. Ask Meta Muse to generate a candidate source-code repair.
3. Validate the replacement target and source checksum.
4. Stage the candidate separately from the original repository.
5. Execute six independent fixture experiments in restricted rootless Docker.
6. Recompute the reported invariant outcomes.
7. Accept or reject the fixture results and record evidence.

The model's explanation does not determine acceptance.

## Quick start

Requirements:

- Node.js 22
- Git
- Bash on Linux or WSL Ubuntu
- Rootless Docker
- Cached Docker image: node:22-bookworm-slim

Clone the Git repository:

```bash
git clone https://github.com/bakomamman-tech/tengalab.git
cd tengalab
```

Run the regression suite:

```bash
npm test
```

Run the complete offline demonstration:

```bash
./scripts/judge-demo.sh
```

The offline demo uses a previously generated Meta Muse source proposal. It does not require a Meta API key or make new Meta API requests.

The demonstration reports the original baseline, the AI-generated repair, the deliberately ineffective modification, and evidence integrity results.

The Docker runner requires a complete Git checkout, not only an extracted source archive.

## Architecture

```text
Meta Muse Spark 1.3
        |
        v
Generated source proposal
        |
        v
Target and SHA-256 validation
        |
        v
Temporary source staging
        |
        v
Restricted rootless Docker
        |
        v
Six independent experiments
        |
        v
Independent observation gate
        |
        v
ACCEPT_FIXTURE / REJECT
        |
        v
Evidence JSON + SHA-256
```

Key components:

- `src/repair/meta-generated-patch.mjs` — Meta source generation
- `src/repair/patch-preview.mjs` — patch validation
- `src/lab/verify.mjs` — fixture experiments
- `src/lab/probe-result-gate.mjs` — independent verdict recomputation
- `scripts/probe-generated-patch.sh` — Docker verification
- `scripts/record-probe.mjs` — evidence recording
- `scripts/negative-control.mjs` — defective-repair rejection
- `scripts/judge-demo.sh` — one-command demonstration
- `demo/fixtures/` — packaged Meta-generated source proposal

## Experimental boundaries

The demonstration verifies six deterministic service-lifecycle invariants:

- Normal event handling
- Recovery from receiver lag
- Explicit shutdown
- Closed-channel termination
- Overflow followed by shutdown
- Lag followed by channel closure

`ACCEPT_FIXTURE` means the submitted candidate passed these six fixture checks.

It does not establish general software correctness, production readiness, or resistance to arbitrary malicious code.

The evidence is locally generated and checksum-checked, not externally attested. SHA-256 checks are integrity checks, not digital signatures.

Rootless Docker with restricted privileges, resources and networking reduces exposure but is not a complete security boundary against hostile code.

## Meta API

The live generation adapter supports Meta Muse Spark 1.3 through the Meta Model API.

Credentials are supplied through `MODEL_API_KEY` at runtime. No API key is included in the demonstration fixture.

The offline demo is the recommended starting point for reviewers.

## Project status

**Hackathon MVP — working experimental demonstration.**

The current implementation demonstrates AI-generated source repair, controlled fixture testing, rejection of ineffective patches, and reproducible local evidence.

The broader vision is a general-purpose autonomous reliability laboratory supporting diverse repositories, richer experiments, secure execution and human-reviewed repair workflows.

## Hackathon

Meta Global AI Developer Hackathon 2026

Track: Startup

Developed by Tengacion Technologies Limited.

**TengaLab — Don't trust the patch. Prove it.**

## Local Proof Console (OBS demo)

The `feature/proof-console` branch adds a local web interface for the verified offline demonstration.

```bash
npm test
npm run console
```

Open **http://localhost:4173** in Windows while Ubuntu is running. The page loads the previously recorded Meta Muse source proposal, displays locally checked evidence, and offers a button that launches the actual `scripts/judge-demo.sh` in rootless Docker. It does **not** make a new model API call. See [Proof Console guide](docs/PROOF-CONSOLE.md).
