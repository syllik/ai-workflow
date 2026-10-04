# Independent review handoff

Reviewer is provider-independent, read-only, and separate from Executor/Publisher. Use one independent reviewer context for one pinned current head SHA only after the repository-defined required CI gate for that exact head is complete and green.

## Repository

## Pinned base SHA

## Pinned head SHA

## Exact diff scope

## Execution evidence checked

## Risk / escalation trigger

## Findings

Return one consolidated package ordered by severity. Each finding has a stable ID, severity, evidence, file/location, and required correction. If none are material, state that and list checks performed.

Do not implement fixes, mutate the branch/PR, publish, change Issue/Project/deployment/settings state, or merge. Do not start a duplicate review already running/current for this head. A head change invalidates this review.

## Correction handoff

Correction authority comes from the task contract, not Reviewer. v2 may authorize up to two bounded correction batches upfront. Legacy v1/unspecified handoffs require human authorization per batch. Forward the consolidated package once; after the correction limit or a disputed finding, escalate to a human.
