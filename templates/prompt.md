# Luna execution prompt

Сгенерированный prompt должен быть self-contained: Luna читает только
необходимый context и не повторяет broad research Sol.

## Task

## Repository

## Base branch

## Base SHA

## PR target

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

## Completion gate

## Git policy

Укажите commit message, разрешён ли push, и что Luna никогда не merge.

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
* Stage only task-owned files, commit, push, and open/update PR when authorized.
* Never merge or enable auto-merge.

## Definition of done
