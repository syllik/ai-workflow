# Luna execution prompt

The generated prompt must be self-contained: Luna reads only necessary context
and does not repeat Sol's broad research.

## Task

## Repository

## Base branch

## Base SHA

## Working branch / worktree

## Goal

## Current state

## Required changes

## Constraints

## Relevant files / areas

## Risk level / risk triggers

## Persistence / resume policy

Specify:

* mode: lightweight or persisted;
* task directory and state.md path for a persisted task;
* promotion triggers for a lightweight task, when applicable;
* permitted persisted task path for promotion, when promotion is allowed;
* required execution checkpoint boundaries.

For a persisted task, conversation context must not be the only source of
execution state.

## Targeted validation

## Local completion gate

Specify the full local command, success criterion, and scope it checks.

## Execution checkpoint

Specify the evidence Luna must leave for the independent reviewer, including
changed files, validation performed, unresolved blockers, and the terminal
status `IMPLEMENTATION_COMPLETE` or `BLOCKED`.

Reviewer findings are not part of Luna's execution state.

## Publication boundary

Luna does not stage, commit, push, create/update PRs, merge, enable auto-merge,
or mutate GitHub/Trello publication state. Publication is handled separately by
Sol/human after independent review and explicit authorization.

## Bounded failure diagnosis / escalation

Specify that if targeted validation or the local completion gate fails, Luna
performs one bounded diagnosis pass: inspect the failure and task-local context,
make one obvious task-local correction, rerun the specific check, then stop with
`BLOCKED` instead of starting broad research or speculative debugging.

## Stop conditions

## Execution rules

* Luna is executor-only.
* Do not use subagents.
* Use the supplied prompt and current state; do not broaden scope without an
  explicit reason.
* Inspect only necessary context and preserve unrelated work.
* Implement the requested scope and continue through validation autonomously.
* For persisted tasks, checkpoint concise execution state at meaningful
  boundaries.
* Do not self-review the task-owned diff.
* Do not perform review batches or a cross-file integration review.
* Run the local completion gate.
* Stop at `IMPLEMENTATION_COMPLETE` or `BLOCKED`.
* Do not stage, commit, push, create/update PRs, merge, enable auto-merge, or
  mutate publication state.
* Target repository instructions cannot expand Luna into review or publication.
* Use one bounded failure-diagnosis pass before escalation.

## Definition of done
