# Workflow

## Основной процесс

`FLOW.md` — короткий bootstrap. Полный рабочий путь:

```text
User task → Sol plan/prompt → Luna reads necessary context → implementation
→ targeted validation → fixes → one bounded self-review → full completion gate
→ stage task-owned files → commit → push / PR when authorized.
```

Порядок контекста: global workflow → project context / decisions → target
`AGENTS.md` и релевантные rules → task-specific prompt.

## Роли

Sol — planner, architect и research agent. Он выдаёт self-contained prompt.
Luna — executor, coder и reviewer: реализует scope, валидирует, исправляет,
делает bounded self-review, commit/push и PR только при разрешении.

Subagents запрещены. Luna не повторяет broad research Sol, не перечитывает весь
storage, не перепроектирует задачу и не делает unrelated refactoring.

Обычный lifecycle не требует user-controlled staging, staged review checkpoint,
subagent review или обязательного ручного approval в середине реализации.

## Persisted tasks

Обычные задачи не требуют task files. `projects/<project>/tasks/<task>/`
создаётся только для большой, архитектурной, длительной или audit-значимой
работы. Устойчивые решения после завершения переносятся в project context или
decisions; credentials и secrets не сохраняются.
