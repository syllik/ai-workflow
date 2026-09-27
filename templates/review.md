# Independent review escalation / fallback

Use this separately from Luna execution state/result.

Routine published PR review belongs to managed Codex GitHub Code Review.
Automatic PR review is disabled. Trigger routine review only with an explicit
`@codex review` comment after the repository-defined full CI gate for the current
head is complete and green; never trigger while CI is pending/failing or while a
review for that head is already running/current. Use this template only when Sol
5.6 High is explicitly needed for escalation or fallback:
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
