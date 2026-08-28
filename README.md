# Рабочий контекст для AI

Этот репозиторий хранит устойчивый рабочий контекст, решения, планы, prompts для Luna и результаты задач. Полные дампы разговоров здесь не сохраняются.

## Роли

- **GPT-5.6 Sol** — planner, architect и research-агент: анализирует задачу, проводит исследование, принимает архитектурные решения и готовит план.
- **Luna xhigh** — executor, coder и reviewer: выполняет утвержденный план, проверяет изменения и фиксирует результат.

## Структура

- [`global/context.md`](global/context.md) — постоянные правила для всех проектов.
- [`global/workflow.md`](global/workflow.md) — основной процесс и lifecycle задачи.
- `projects/<project>/` — canonical context конкретного проекта, решения и задачи.
- `prompts/` — короткие reusable prompts.
- `templates/` — минимальные заготовки для новых сущностей.
- [`AGENTS.md`](AGENTS.md) — правила для AI-агентов.

## Как работать

### Создать проект

1. Создайте `projects/<project>/`.
2. Скопируйте [`templates/project.md`](templates/project.md) в `projects/<project>/context.md`.
3. Заполните контекст проекта и при необходимости создайте `decisions.md` из [`templates/decision.md`](templates/decision.md).

### Создать задачу

Создайте `projects/<project>/tasks/<task>/` и добавьте четыре файла:

- `context.md` — из [`templates/task.md`](templates/task.md);
- `plan.md` — в формате утвержденного implementation plan;
- `prompt.md` — из [`templates/prompt.md`](templates/prompt.md);
- `result.md` — из [`templates/result.md`](templates/result.md).

Sol сначала обновляет task context, затем сохраняет утвержденный implementation plan в `plan.md` и финальный prompt для Luna в `prompt.md`.

### Сохранить результат

После реализации Luna записывает в `result.md` сделанное, измененные файлы, проверки и оставшиеся проблемы. Если появились устойчивые изменения архитектуры, workflow или conventions, перенесите их в `projects/<project>/context.md` или `decisions.md`. `tasks/` остается историей конкретной работы и не является постоянным source of truth.

### Продолжить работу в новой AI-сессии

Прочитайте:

```text
global/context.md
global/workflow.md
projects/<project>/context.md
projects/<project>/tasks/<task>/context.md
projects/<project>/tasks/<task>/plan.md
```

После этого выполните `prompt.md`.

Не сохраняйте API keys, passwords, access tokens, refresh tokens, private keys, содержимое `.env` или другие credentials. См. также [`.gitignore`](.gitignore).
