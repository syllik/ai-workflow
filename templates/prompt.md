# Luna execution prompt

Сгенерированный prompt должен быть self-contained: Luna читает только
необходимый context и не повторяет broad research Sol.

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

Укажите:

* mode: `lightweight` или `persisted`;
* task directory / `state.md` path для persisted task;
* promotion triggers для lightweight task, если они применимы;
* допустимый persisted task path для promotion, если promotion разрешён;
* необходимые checkpoint boundaries.

Для persisted task conversation context не должен быть единственным источником
execution state.

## Review strategy

Укажите:

* ожидаемый review scope;
* known coherent review areas / batches, если они заранее известны;
* cross-file или state/data-flow risks, требующие integration pass.

Не задавайте arbitrary batch size по количеству файлов.

## Targeted validation

## Local completion gate

Укажите полную локальную команду, критерий успеха и scope того, что она проверяет.

## Pre-push gate

Укажите target-repository pre-push validation, если она определена, и повторяет
ли она local completion gate.

## Required remote CI / integration readiness gate

Укажите required remote CI, PR target, критерии green/readiness и тот факт, что
local green или preview/deployment signals не заменяют required remote gate,
если это применимо.

## Git publication policy

Укажите commit message, разрешены ли stage/commit/push и open/update PR, имя
authorized task branch, а также запрет на merge и auto-merge.

## No-direct-push restrictions

Укажите protected integration/release branches, в которые Luna не может push
напрямую, если такие ограничения определены supplied workflow.

## Bounded failure diagnosis / escalation

Укажите, что при падении targeted validation, local completion gate,
target-repository pre-push gate или required remote CI Luna делает один bounded
diagnosis pass: inspect failure and task-local context, make one obvious
task-local correction, rerun the specific check, then escalate instead of
starting broad research or speculative debugging.

## Stop conditions

## Execution rules

* No subagents.
* Consume the supplied plan; do not re-plan unless an assumption is proven false.
* Inspect only necessary context and preserve unrelated work.
* Implement the requested scope and continue through validation autonomously.
* For persisted tasks, checkpoint concise execution state at meaningful boundaries.
* Review the complete task-owned diff.
* Keep a small diff as one bounded review.
* Partition a non-trivial diff into coherent batches and finish with a short cross-file integration pass.
* Do not rely on conversation context as the only source of persisted execution state.
* Run the local completion gate.
* Push only an authorized task branch.
* Open/update the PR into the declared PR target.
* Check required remote CI when applicable.
* Never push directly to protected integration/release branches when forbidden by supplied workflow.
* Never merge.
* Never enable auto-merge.
* Use one bounded failure-diagnosis pass before escalation.

## Definition of done
