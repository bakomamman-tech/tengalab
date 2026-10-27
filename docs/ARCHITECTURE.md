# TengaLab Architecture — Foundation

## Product claim (future)
An autonomous software reliability scientist that discovers failures, generates and evaluates controlled hypotheses, repairs code in isolation, and emits independently reproducible evidence.

## Milestone 1 actually implements
1. **Subject:** bounded event channel + lifecycle service (3 pre-authored implementations).
2. **Experiments:** 6 independent scenarios each with an executable invariant.
3. **Planner:** either deterministic baseline or Meta Muse Spark 1.3 choosing from an allowlist.
4. **Dispatcher:** validates plan before executing only allowlisted experiment IDs.
5. **Verifier:** accepts only if all 6 independently assessed invariants pass.
6. **Evidence store:** JSON result traces with SHA256 of substantive results.

```text
                          +---------------------------+
                          | Planner                   |
                          | deterministic or Meta API |
                          +-------------+-------------+
                                        |
                               nextExperiment ID
                                        v
                          +---------------------------+
                          | Bounded action dispatcher |
                          | checks experiment allowlist|
                          +-------------+-------------+
                                        |
                                        v
                          +---------------------------+
                          | Fresh service simulation  |
                          | buggy / naive / correct   |
                          +-------------+-------------+
                                        |
                                    observations
                                        v
                          +---------------------------+
                          | Independent invariant gate|
                          | ALL pass => ACCEPT        |
                          +-------------+-------------+
                                        |
                                        v
                          +---------------------------+
                          | Evidence + SHA256         |
                          +---------------------------+
```

## Why the independent gate matters
The planner's rationale never changes the acceptance criterion. The `naive` candidate **passes** the high-throughput burst test but **fails** proper shutdown. Rejecting this patch is the core milestone.

## Model API boundary
Meta call uses a JSON Schema to constrain the model's selected `nextExperiment` to a currently available name. The runtime independently validates this decision again before running anything. No key is hard-coded; API calls are opt-in; no fallback quietly impersonates Meta.

## Milestone 2 recommendation
Replace pre-scripted scenarios with **generated stress-test parameters** and a diagnostic experiment planner. Use real Node worker threads and timed I/O to introduce genuine concurrency. Keep deterministic invariant checking, bounded subprocess execution, original example repositories, and strong audit logging. Benchmark model-guided discovery against deterministic/property-based baselines.

## Later milestones
- Repair via ephemeral Git worktrees and reversible patch proposals.
- Cross-check invariants with independently authored adversarial tests.
- Docker isolation with no network by default, cgroups, timeouts, read-only mounts, and no host secrets.
- React dashboard for experiment lifecycle, hypothesis lineage, coverage, and acceptance gates.
- GitHub PR as human-approved output, never unattended merge or deployment.
