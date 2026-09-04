# Luna execution prompt

The generated prompt must be self-contained: Luna reads only necessary context
and does not repeat Sol's broad research.

## Task

## Repository

## Base branch

## Base SHA

## PR target / integration branch

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
* required checkpoint boundaries.

For a persisted task, conversation context must not be the only source of
execution state.

## Review strategy

Specify:

* expected review scope;
* known coherent review areas or batches, when known in advance;
* cross-file or state/data-flow risks requiring an integration pass.

Do not prescribe an arbitrary batch size by file count.

## Targeted validation

## Local completion gate

Specify the full local command, success criterion, and scope it checks.

## Pre-push gate

Specify target-repository pre-push validation, when defined, and whether it
duplicates the local completion gate.

## Required remote CI / integration readiness gate

Specify required remote CI, PR target, green/readiness criteria, and the fact
that local green or preview/deployment signals do not replace the required
remote gate, when applicable.

## Git publication policy

Specify the commit message, whether stage/commit/push and open/update PR are
allowed, the authorized task branch, and the prohibition on merge and
auto-merge.

## No-direct-push restrictions

Specify protected integration or release branches that Luna must not push to
directly, when those restrictions are defined by the supplied workflow.

## Bounded failure diagnosis / escalation

Specify that if targeted validation, the local completion gate,
target-repository pre-push gate, or required remote CI fails, Luna performs one
bounded diagnosis pass: inspect the failure and task-local context, make one
obvious task-local correction, rerun the specific check, then escalate instead
of starting broad research or speculative debugging.

## Stop conditions

## Execution rules

* Do not use subagents.
* Use the supplied prompt and current state; do not broaden scope without an
  explicit reason.
* Inspect only necessary context and preserve unrelated work.
* Implement the requested scope and continue through validation autonomously.
* For persisted tasks, checkpoint concise execution state at meaningful
  boundaries.
* Review the complete task-owned diff.
* Keep a small diff as one bounded review.
* Partition a non-trivial diff into coherent batches and finish with a short
  cross-file integration pass.
* Run the local completion gate.
* Push only an authorized task branch.
* Open or update the PR in the declared PR target.
* Check required remote CI when applicable.
* Never push directly to protected integration or release branches when
  forbidden by the supplied workflow.
* Never merge.
* Never enable auto-merge.
* Use one bounded failure-diagnosis pass before escalation.

## Definition of done
