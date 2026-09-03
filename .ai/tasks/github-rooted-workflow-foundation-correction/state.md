# Correction execution state

## Current phase

READY_FOR_LUNA.

## Scope

Correct Phase 1A implementation defects in `syllik/ai-workflow` on `task/github-rooted-agent-architecture`; update existing PR #4 only.

## Anchors

- Original immutable Phase 1A handoff: `2fca3e40ec86c76cf3e2e581bf08f164c2f920c6`.
- Pre-correction implementation head: `06b293d9e1de1697c07efec6fd5dc0907c1d025b`.
- Correction handoff: launcher-pinned commit that introduces this state.
- Current PR head is mutable during execution and must be read from Git/GitHub; it is not the original handoff.

## Required work

- Make manifest validation extensible.
- Permit canonical apply in product code, but do not execute it here.
- Separate manifest path from workspace root.
- Generate managed contracts inside each target repository.
- Permit read-only clone while prohibiting read-only writes.
- Render GitHub-native links without backend context.
- Use English GitHub-only agent routing and repair stale state semantics.

## Safety

No subagents. Preserve unrelated work. No dependency changes. Do not modify any other repository. Never write to `ChipIn-one/chipin-backend`. No real apply against `/Users/mihaildovgun/Desktop/WORK`. No reset, rebase, stash, force-push, merge, auto-merge, branch deletion, or direct push to `master`.

## Next

Luna reads `prompt.md`, implements test-first corrections, runs all gates, updates this file, creates `result.md`, pushes the same branch, and stops at `READY_FOR_HUMAN_MERGE`.

## Blockers

None.
