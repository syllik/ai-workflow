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

## Targeted validation

## Completion gate

## Git policy

Укажите commit message, разрешён ли push, и что Luna никогда не merge.

## Stop conditions

## Execution rules

- No subagents.
- Consume the supplied plan; do not re-plan unless an assumption is proven false.
- Inspect only necessary context and preserve unrelated work.
- Implement the requested scope and continue through validation autonomously.
- Review the final diff once; use a deeper same-Luna pass only for risk triggers.
- Stage only task-owned files, commit, push, and open/update PR when authorized.
- Never merge or enable auto-merge.

## Definition of done
