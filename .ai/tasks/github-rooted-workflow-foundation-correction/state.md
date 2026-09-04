# Correction execution state

## Current phase

SUPERSEDED_BY_GITHUB_ROOTED_WORKFLOW_FOUNDATION_CORRECTION_2.

## Anchors

- Original immutable handoff: `2fca3e40ec86c76cf3e2e581bf08f164c2f920c6`.
- Pre-correction implementation head: `06b293d9e1de1697c07efec6fd5dc0907c1d025b`.
- Correction handoff: `84232d4589c4fde9713015d83aeefc75a2f567dd`.
- Current PR #4 head is mutable and was verified from local Git and GitHub.

## Completed

- Manifest validation is extensible; CLI and direct options separate checkout manifest from target root.
- Apply permits canonical roots after normal checks; only isolated apply ran here.
- Managed contracts route into each managed repository; read-only clone/write rules and GitHub-native index links are covered.
- English routing/state documentation is corrected; the prior foundation result is marked superseded.
- PR #4 was updated in place; no other repository was modified.

## Validation

- `npm test`: 33 passed; `npm run verify`: passed; manifest-only and `git diff --check`: passed.
- PR #4: `OPEN`, non-draft, `MERGEABLE`, base `master`; no configured remote checks.
- No real canonical apply and no backend write ran.

## Next

Correction 2 is the current source of truth for PR #4; see its task state.

## Blockers

None.
