# Correction 2 execution state

## Current phase

READY_FOR_LUNA.

## Scope

Remove five verified Phase 1A blockers in `syllik/ai-workflow` on `task/github-rooted-agent-architecture`; update existing PR #4 only.

## Anchors

- Original Phase 1A handoff: `2fca3e40ec86c76cf3e2e581bf08f164c2f920c6`.
- Correction 1 handoff: `84232d4589c4fde9713015d83aeefc75a2f567dd`.
- Pre-correction-2 implementation head: `656d3d4cefddef771c2aa205c878009b5fd8eff0`.
- Correction 2 handoff: launcher-pinned commit introducing this state.
- Current PR head is mutable and must be verified from Git/GitHub.

## Required work

- Preserve populated project contexts and enforce their budgets.
- Use absolute canonical GitHub routing from profile and target repositories.
- Make one apply clone and fully scaffold a missing managed repository.
- Check only known central/managed artifacts, including human plan budgets.
- Keep every plan file human-only and unread by Luna.

## Safety

No subagents or dependency changes. Preserve unrelated work. Modify no other repository. Never write to backend. Do not run real apply against `/Users/mihaildovgun/Desktop/WORK`. No reset, rebase, stash, force-push, merge, auto-merge, branch deletion, or direct push to `master`.

## Next

Luna reads `prompt.md`, implements test-first corrections, runs all gates, updates state/result and PR #4, then stops at `READY_FOR_HUMAN_MERGE`.

## Blockers

None.
