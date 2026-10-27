# TengaLab — Experiment 001

> **Don't trust the patch. Prove it.**

An original, dependency-free Node.js laboratory for testing a software repair against adversarial invariants. Built as a starting point for **Tengacion Technologies Limited's Meta Global AI Developer Hackathon 2026** entry.

**Status: Milestone 1 prototype.** Three prewritten service implementations (buggy, naive, correct) demonstrate the independent proof gate. A **real Meta Muse Spark API adapter** can choose the next bounded experiment, but it is **not** yet an autonomous bug-discovery/patch-writing system. No live Meta API requests have been executed as part of this package's offline verification.

## Run it locally

Requires **Node.js >=20** (Node 22 recommended) on Windows, Linux, or WSL Ubuntu. No `npm install` is needed.

```bash
node --version
npm test
npm run demo
```

Expected demo summary (exact evidence paths will vary):

```text
buggy    3/6 REJECT
naive    2/6 REJECT
correct  6/6 ACCEPT
```

The evidence JSON plus separate SHA256 digest are written into `evidence/` on each run. Those files are intentionally ignored by git.

## Run investigations

Choose a candidate and a deterministic (non-AI) planner:

```bash
node src/cli.mjs investigate --candidate correct --agent deterministic
```

To try Meta's real model-generated experiment selection:

```bash
export MODEL_API_KEY='paste-your-key-locally-not-in-git-or-chat'
node src/cli.mjs investigate --candidate buggy --agent meta
```

- Endpoint: `https://api.meta.ai/v1/chat/completions`
- Default model: `muse-spark-1.3` (override with `META_MODEL` for supported Chat Completions models).
- Auth: Bearer `MODEL_API_KEY`.
- Schema constrained output: `{nextExperiment, rationale}`.
- Model has **no arbitrary shell, filesystem, Git, or network tool rights**. It chooses one of six experiment IDs, executed by a hard-coded dispatcher.
- A failed verification intentionally exits with status `2`; this is **not** an application crash.

> **Security:** Export your API key in your own shell, do not paste it into ChatGPT or commit `.env`. Do not run untrusted repositories in this starter; a real system needs hardened, isolated execution and secret stripping.

## The experiment

The event service has a bounded ring channel. When 300 messages arrive before a receiver advances on a 32-slot channel, the receiver gets a `Lagged` event representing dropped messages. The original bug incorrectly treats this nonterminal event as a shutdown. A naive patch stops terminating on lag, but **also fails to respect an explicit shutdown or channel closure**. The correct candidate distinguishes both signals, using a sticky control-plane shutdown request that survives overflow.

| Test | Expected invariant |
|---|---|
| `steady` | Three ordinary messages processed; service alive |
| `burst` | Recover from lag without terminating |
| `shutdown` | Explicit shutdown terminates |
| `close` | Closed channel terminates |
| `overflow_then_shutdown` | Shutdown still honored during overflow |
| `lag_then_close` | Overflow tolerated, then closure honored |

All six must pass for acceptance. The fixture is a **deterministic simulation**, not a demonstration of concurrent thread scheduling in production.

## Files

```text
src/lab/channel.mjs       Bounded event channel with explicit Lagged and Closed states
src/lab/service.mjs       Three prewritten candidate implementations
src/lab/experiments.mjs   Independent experiment definitions and invariants
src/lab/verify.mjs        All-invariants gate
src/lab/evidence.mjs      Evidence JSON and stable SHA256 hash
src/agent/deterministic.mjs   Non-AI control condition
src/agent/meta.mjs        Real Muse Spark API-backed next-experiment selection
src/agent/investigate.mjs Safe bounded dispatch loop
src/cli.mjs               Demo and investigation commands
tests/                    Node built-in tests
docs/                     Architecture and next build milestone
```

## What is not implemented yet

1. Model-generated *new* test programs or hypotheses; the six experiments here are predefined.
2. Model-generated candidate patches and Git worktree isolation.
3. Real concurrent runtime / fault injection (fixture currently deterministic).
4. Production Docker isolation, resource limits, GitHub integration, or review/approval workflows.
5. Live React dashboard, external benchmark, or validated performance improvements.

We should build these in that order, measuring quality at each stage. Don't claim that this MVP autonomously discovers or repairs arbitrary bugs.

## Verified reference docs

- [Meta Model API overview](https://dev.meta.ai/docs/overview)
- [Meta Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions)
- [Meta structured outputs](https://dev.meta.ai/docs/structured-output)
- [Meta Global Hackathon](https://dev.meta.ai/events/global-hackathon)
