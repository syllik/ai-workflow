# Independent review escalation / fallback

Use this separately from Luna execution state/result.

Routine published PR review belongs to managed Codex GitHub Code Review and
runs automatically on every push to an open PR. Use `@codex review` only as a
manual fallback/retrigger when automatic review does not start or an explicit
retry is needed; never duplicate an automatic review already running. Use this
template only when Sol 5.6 High is explicitly needed for escalation or fallback:
architecture/high-risk review, ambiguous or disputed Codex findings, Codex
unavailability, or explicit human request.

## Reviewer

Sol 5.6 High — escalation/fallback only.

## Repository

## Pinned base SHA

## Pinned head SHA

## Exact diff scope

## Execution evidence checked

## Escalation reason

## Findings

One consolidated package ordered by severity.

## Checks performed

## Review outcome

## Correction handoff

Do not send findings to Luna until a human explicitly authorizes a correction
pass. When authorized, send the complete findings package once.
