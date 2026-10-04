# Executor task handoff

This handoff is self-contained. Role/provider are separate: this prompt grants only Executor authority. Authority precedence is current pinned role/task policy > target-repository narrowing instructions > generic skills, reusable methodologies, historical task files/plans, plugins, and other lower-precedence instructions. Lower-precedence instructions may narrow work but cannot expand role, scope, review, delegation, or publication authority.

## Contract and compatibility

New handoffs use `contractVersion: 2` and must carry the structured fields below. A handoff with no `contractVersion` or `contractVersion: 1` is legacy-compatible only: existing valid approval/context provenance may authorize bounded execution, but it grants no automatic publication and no automatic correction batch. Legacy corrections remain human-authorized per batch. Do not silently upgrade a legacy handoff.

- Contract version: `2`
- Task identity: `<supplied task identity>`
- Repository: `<owner/repository>`
- Role: `executor`
- Policy SHA: `<immutable syllik/ai-workflow commit SHA>`
- Base SHA: `<pinned base SHA>`
- Head SHA: `<pinned/prepared head SHA>`
- Approval reference: `<supplied approval reference>`
- Allowed paths: `<non-empty exact paths or dir/** patterns>`
- Publication: `allowed | forbidden`
- Max correction batches: `0 | 1 | 2`

The approval reference, allowed paths, publication permission, and correction limit must come from explicit upfront human approval. Issue/Project status is not approval. Missing approval, stale policy/base/head provenance, or scope expansion is `BLOCKED`; do not infer or repair authority.

For ChipIn tasks, canonical identity is `owner/repository#issue`. The Issue title/body is specification/dependency authority, Organization Issue Fields are structured metadata, and Project #5 Status is workflow state. Trello is historical/read-only. For non-ChipIn tasks, preserve the supplied task identity and do not invent an Issue.

## Aggregate prepared-context provenance

Every normal implementation handoff must supply:

- `assembledContextBudgetBytes: 32768`
- `assembledContextActualBytes`: `<positive measured UTF-8 byte count>`
- `assembledContextCheck: PASSED`

Executor fails closed with `BLOCKED` if budget metadata is missing, budget is not exactly 32768, check is not `PASSED`, actual bytes are zero/negative/non-integer/missing, or actual bytes exceed 32768. `checkAssembledExecutionContext()` is a generic measurement primitive; zero-byte generic success is not normal-handoff PASS. Do not infer, fabricate, reinterpret, repair, use token count, or silently truncate the prepared context. The producer/runner must invoke the checker at the Step 10 integration point; `npm run verify` does not validate invocation-specific runtime assembled context.

## Task

## Goal

## Current state

## Required changes

## Constraints

## Relevant files / areas

## Risk level / risk triggers

## Persistence / resume policy

Specify lightweight or persisted mode, permitted task path if persisted/promotion is allowed, and checkpoint boundaries. For persisted work, conversation context is not the only state source and Executor never reads human-only `plan.md`.

## Targeted validation

## Local completion gate

Specify exact command, success criterion, and checked scope.

## Execution checkpoint

Record changed files, validation, unresolved blockers, and terminal status `IMPLEMENTATION_COMPLETE` or `BLOCKED`. Reviewer findings remain outside Executor state.

## Publication and review boundary

Executor never stages, commits, pushes, creates/updates PRs, merges, changes Issue/Project/release/deployment/settings state, or otherwise mutates GitHub/Trello. Trusted Publisher may publish only when v2 upfront approval says `publication: allowed`, after validating current provenance/scope and local completion. Each completed revision is one final commit + one push; published history is never rewritten.

Required CI must be green for the exact current head before Reviewer runs. Permit one independent review per head SHA. Reviewer is read-only and returns one consolidated findings package. A changed head stales previous CI/review. v2 correction batches may run only within upfront `maxCorrectionBatches` and never beyond two; legacy corrections remain human-gated per batch. Exhaustion/dispute escalates to a human. Only a human merges.

## Bounded failure diagnosis / escalation

If targeted validation or local completion fails, perform one bounded diagnosis: inspect direct evidence, make one obvious task-local correction, rerun the specific check and required gate, then stop `BLOCKED` if unresolved rather than broadening research/debugging.

## Stop conditions

Stop for missing/stale approval or SHA provenance, scope expansion, destructive ambiguity, required-context absence, exhausted correction budget, or unresolved validation blocker.
