# Workflow

## Основной процесс

```text
Idea / Problem
↓
GPT-5.6 Sol
↓
Research / Analysis
↓
Architecture / Decision
↓
Implementation Plan
↓
Final Luna Prompt
↓
Luna xhigh implementation
↓
Luna review / verification
↓
Result
↓
Update canonical project context
```

GPT-5.6 Sol — planner, architect и research-агент. Luna xhigh — executor, coder и reviewer. Luna не должна самостоятельно расширять scope или перепроектировать систему, если это явно не указано в prompt.

Subagents не используются. Токены расходуются экономно: уже зафиксированные решения не исследуются повторно без причины.

## Lifecycle задачи

1. Создать task.
2. Sol анализирует задачу.
3. Sol обновляет `context.md` задачи.
4. Sol создает `plan.md`.
5. Sol создает `prompt.md` для Luna.
6. Luna реализует.
7. Luna проверяет изменения.
8. Результат записывается в `result.md`.
9. Устойчивые знания переносятся в project context или decisions.
10. Task остается историей конкретной работы.

Если задача изменила архитектуру, workflow, conventions или другое устойчивое состояние, обновите `projects/<project>/context.md` или `projects/<project>/decisions.md`. Не превращайте task в постоянный source of truth.
