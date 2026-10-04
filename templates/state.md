# Execution state

Rolling checkpoint for a persisted executor task. Keep this concise and replace stale state instead of appending a journal. Do not store reasoning dumps, raw command output, secrets, credentials, or reviewer findings.

## Current phase

## Completion status

Use only `IN_PROGRESS`, `IMPLEMENTATION_COMPLETE`, or `BLOCKED`.

## Task identity and provenance

Copy supplied values unchanged; do not infer or replace them. For ChipIn, canonical task identity is `owner/repository#issue`; for non-ChipIn preserve the supplied identity. If `contractVersion` is absent, record compatibility as `legacy-v1`; never invent v2 publication/correction rights.

- Contract version / compatibility:
- Task identity:
- Policy SHA:
- Repository:
- Branch:
- Base SHA:
- Head SHA:
- Scope / approval reference:
- Publication permission:
- Max correction batches:
- Correction batches used:

## Completed

## Changed paths

## Validation receipt

## Decisions / assumptions

Only task-local facts required for Executor continuation.

## Pending external action

## Next

Record exactly one next step.

## Blockers
