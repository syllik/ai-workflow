# Execution state

Rolling checkpoint for a persisted executor task.

Keep this file concise. Replace stale state instead of appending a journal.
Do not store reasoning dumps, raw command output, secrets, credentials, or
reviewer findings.

## Current phase

## Completion status

Use only `IN_PROGRESS`, `IMPLEMENTATION_COMPLETE`, or `BLOCKED`.

## Task identity and provenance

Copy the supplied task identity unchanged from the prepared task prompt; do not
infer, substitute, or fabricate a GitHub Issue identity. For ChipIn tasks,
canonical task identity is `owner/repository#issue`. For non-ChipIn tasks,
preserve the supplied task-specific identity unchanged; do not invent a GitHub
Issue.

Copy the supplied Policy SHA unchanged from the prepared task prompt; do not
infer or substitute it.

- Task identity:
- Policy SHA:
- Repository:
- Branch:
- Base SHA:
- Head SHA:
- Scope / approval reference:

## Completed

## Changed paths

## Validation receipt

## Decisions / assumptions

Only task-local facts required for executor continuation.

## Pending external action

## Next

Record exactly one next step.

## Blockers
