# Correction 4 execution state

## Current phase

READY_FOR_LUNA.

## Scope

Fix the verified generated-index convergence defect in `syllik/ai-workflow` on
`task/github-rooted-agent-architecture`; update PR #4 only.

## Anchors

- Pre-correction-4 head: `0aafd7e896e874ca18ca732b74a52a370b26931c`.
- Required handoff: the launcher-pinned correction-4 commit.
- Current PR head is mutable and must be verified from GitHub.

## Confirmed finding

`checkGeneratedFiles` detects stale `projects/index.md`, while `planWorkspace`
and `apply` have no operation that can regenerate it. A new manifest record
cannot reach clean `check` through the documented flow.

## Required work

- Add an exact, central-only generated index operation.
- Prove manifest checkout identity, Git safety, and real-path containment.
- Revalidate fingerprint, exact renderer content, and path before mutation.
- Preserve same-process convergence without weakening dirty-worktree rules.
- Add full new-project convergence and adversarial safety tests.

## Validation

Not run by Luna yet.

## Decisions / assumptions

- Canonical input manifest changes are committed before `apply`.
- Generated index content is exclusively `renderProjectIndex(manifest)`.
- Integrated `apply` is required; a separate generator command needs a new Sol
  decision.

## Next

Verify the pinned handoff and begin focused TDD from `prompt.md`.

## Blockers

None.
