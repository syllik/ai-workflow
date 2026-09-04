# Correction 3 execution state

## Current phase

IMPLEMENTING_CORRECTIONS.

## Scope

Fix five verified Phase 1A defects in syllik/ai-workflow on
task/github-rooted-agent-architecture; update PR #4 only.

## Anchors

- Required handoff: b17c821f0202395847f5ec3f9b81fbf9402797b9.
- Pre-correction-3 head: fcbe029223b0e77d60b1c92918ff99c4170b0958.
- Current PR head is mutable and must be verified from GitHub.

## Required work

- Block all pre-existing uncommitted files; allow only exact same-process
  generated outputs during convergence.
- Reject descendant symlinks and prove real containment before reads and writes.
- Regenerate and verify the central root AGENTS managed block.
- Make reusable agent prompts/templates English and plan-independent.
- Require managed contextPath to equal .ai/context.md.

## Completed

- Verified branch, remote, fast-forward, and required handoff SHA.
- Removed unconditional untracked allowances and added exact same-process
  output fingerprints for CLI convergence.
- Added dirty-repository and descendant-symlink regressions.
- Added central AGENTS, reusable-content, and managed-context-path coverage.
- Implemented real-path containment for plan, preflight, check, and artifact
  collection; regenerated the central AGENTS block.

## Validation

- Focused operations, CLI, manifest, budget, and workflow suites pass.
- git diff --check passes.
- Current checkout cli.mjs check passes.

## Decisions / assumptions

- Generated-output allowances are process-local and fingerprint-backed, and
  are propagated only through the current CLI apply convergence loop.

## Next

Review the complete task-owned diff, run all gates, create result.md, verify
PR #4, and stop at READY_FOR_HUMAN_MERGE.

## Blockers

None.
