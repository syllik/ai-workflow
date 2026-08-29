# Рабочий контекст для AI

Этот repository хранит canonical workflow, устойчивый project context, решения
и короткие reusable prompts для работы Sol и Luna. Полные дампы разговоров и
секреты здесь не сохраняются.

Начинайте с [`FLOW.md`](FLOW.md). Он задаёт стабильный bootstrap и не заменяет
проверку актуального target GitHub repository.

## Что читает Sol

Sol читает `FLOW.md`, затем только relevant
[`global/context.md`](global/context.md), [`global/workflow.md`](global/workflow.md),
registry [`projects/index.md`](projects/index.md) и context выбранного проекта.
`decisions.md` читается только при релевантности. После этого Sol проверяет
target repository настолько, насколько нужно для planning, architecture,
research, scope и validation.

## Что получает Luna

Sol выдаёт один self-contained execution prompt. Luna читает в target repository
его `AGENTS.md` и local instructions, реализует утверждённый scope, запускает
проверки, просматривает diff, исправляет реальные проблемы, делает commit и
push, если это разрешено prompt и workflow target repository.

## Структура

- [`global/context.md`](global/context.md) — постоянные правила для всех проектов.
- [`global/workflow.md`](global/workflow.md) — роли и lifecycle задач.
- [`projects/index.md`](projects/index.md) — registry GitHub repositories и contexts.
- `projects/<project>/` — устойчивый context и только необходимые persisted tasks.
- `prompts/` — короткие reusable prompts.
- `templates/` — минимальные заготовки для contexts, prompts и результатов.
- [`AGENTS.md`](AGENTS.md) — правила для агентов, работающих непосредственно здесь.

### Reusable prompts

- [`implementation.md`](prompts/implementation.md) — базовые execution rules для Luna.
- [`youtube-zen-source-calibration.md`](prompts/youtube-zen-source-calibration.md) — semantic calibration title и description перед массовой локализацией YouTube.

## Как работать

### Создать проект

1. Добавьте mapping в [`projects/index.md`](projects/index.md).
2. Создайте `projects/<project>/context.md` из [`templates/project.md`](templates/project.md).
3. Заполните только устойчивые сведения и при необходимости создайте `decisions.md`.

### Создать задачу

Для обычной небольшой или средней задачи task directory не создаётся. Sol
возвращает один execution prompt по [`templates/prompt.md`](templates/prompt.md),
а Luna выполняет его в target repository.

Для большой, архитектурной, длительной или audit-значимой задачи создайте
минимальную структуру:

```text
projects/<project>/tasks/<task>/
├── plan.md
├── prompt.md
└── result.md
```

`context.md` не обязателен и добавляется только если есть реальная причина не
дублировать сведения в `plan.md`.

### Сохранить результат

Для persisted task Luna записывает в `result.md` сделанное, изменённые файлы,
проверки и оставшиеся проблемы. Устойчивые изменения architecture, workflow или
conventions переносятся в project context или `decisions.md`; `tasks/` остаётся
историей конкретной работы.

## ChatGPT Web bootstrap

Один раз вставьте следующий текст в Project Instructions ChatGPT Web:

```text
Для software-development tasks используй canonical workflow/context storage:
https://github.com/syllik/my-prompt-storage

Перед planning прочитай FLOW.md из текущего default branch и следуй его reading
order. Определи target project через projects/index.md, загрузи только relevant
project context и проверь актуальный target GitHub repository по необходимости.

GPT-5.6 Sol — planner, architect и research agent.
Luna xhigh — executor, coder и reviewer.

Sol должен выдать один self-contained execution prompt для Luna. Не используй
subagents, минимизируй повторное research и context/token usage. Пользовательские
объяснения пиши на русском языке.
```

ChatGPT Web не следует считать автоматически распознающим `AGENTS.md` в этом
repository без такой bootstrap instruction. Не сохраняйте API keys, passwords,
access tokens, refresh tokens, private keys, содержимое `.env` или другие
credentials. См. также [`.gitignore`](.gitignore).
