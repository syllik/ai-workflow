# Correction 3 execution state

## Current phase

READY_FOR_LUNA.

## Scope

Fix five verified Phase 1A safety/contract defects in `syllik/ai-workflow` on `task/github-rooted-agent-architecture`; update PR #4 only.

## Anchors

- Correction 2 handoff: `1f85efc198e01071c35dee7eaa05d2d58c2729c7`.
- Pre-correction-3 implementation head: `fcbe029223b0e77d60b1c92918ff99c4170b0958`.
- Correction 3 handoff: launcher-pinned commit introducing this state.
- Current PR head is mutable and must be verified from Git/GitHub.

## Required work

- Block all pre-existing uncommitted files; allow only exact same-process generated outputs during convergence.
- Reject descendant symlinks and prove real containment before every read/write operation.
- Regenerate and verify the central root AGENTS managed block.
- Make reusable agent prompts/templates English and independent of human plans.
- Require managed `contextPath` to equal `.ai/context.md`.

## Safety

No subagents or dependency changes. Preserve unrelated work. Modify no other repository. Never write to backend. Do not run real apply against `/Users/mihaildovgun/Desktop/WORK`. No reset, rebase, stash, force-push, merge, auto-merge, branch deletion, or direct push to `master`.

## Next

Luna reads `prompt.md`, implements test-first corrections, runs all gates, updates state/result and PR #4, then stops at `READY_FOR_HUMAN_MERGE`.

## Blockers

None.
