# AI workflow

Этот repository хранит canonical AI workflow, устойчивый project context,
решения и короткие reusable prompts для работы Sol и Luna. Полные дампы
разговоров и секреты здесь не сохраняются.

Начинайте с [`AI.md`](AI.md), затем читайте [`FLOW.md`](FLOW.md). Они задают стабильный bootstrap и не заменяют
проверку актуального target GitHub repository.

## GitHub-rooted foundation

`workspace.yaml` is the canonical project manifest and `projects/index.md` is
its generated navigation. Read one target repository's `.ai/context.md` after
the manifest record; legacy central project contexts remain migration-only.

The workspace validator is intentionally bounded:

```text
npm test
npm run verify
node scripts/workspace/cli.mjs check [--root <path>] [--manifest-only]
node scripts/workspace/cli.mjs plan --root <path>
node scripts/workspace/cli.mjs apply --root <path>
```

Phase 1A supports isolated fixture apply only. It never applies to the real
`~/Desktop/WORK` workspace.

## Что читает Sol

Sol читает `AI.md`, `FLOW.md`, одну запись `workspace.yaml` / `projects/index.md`,
релевантный role file, затем `AGENTS.md` и `.ai/context.md` target repository.
`.ai/decisions.md` и task files читаются только при релевантности. Legacy
central project contexts сохраняются для migration, но не являются active path.

## Что получает Luna

Sol выдаёт один self-contained execution prompt. Luna читает в target repository
его `AGENTS.md` и local instructions, реализует утверждённый scope, запускает
проверки, просматривает полный task-owned diff, исправляет реальные проблемы,
делает commit и push, если это разрешено prompt и workflow target repository.

Для persisted task Luna также использует durable `state.md`, чтобы execution
можно было безопасно продолжить после context compaction, interruption или новой
session без зависимости от conversation history.

## Структура

* [`global/context.md`](global/context.md) — постоянные правила для всех проектов.
* [`global/workflow.md`](global/workflow.md) — роли и lifecycle задач.
* [`projects/index.md`](projects/index.md) — generated GitHub repository registry.
* [`projects/README.md`](projects/README.md) — migration-only legacy storage pointer.
* `.ai/tasks/` — persisted task state for this repository.
* `prompts/` — короткие reusable prompts.
* `templates/` — минимальные заготовки для contexts, prompts, task state и результатов.
* [`AGENTS.md`](AGENTS.md) — правила для агентов, работающих непосредственно здесь.

### Reusable prompts

* [`implementation.md`](prompts/implementation.md) — базовые execution rules для Luna.
* [`code-review.md`](prompts/code-review.md) — bounded findings-first review для Luna.
* [`youtube-zen-source-calibration.md`](prompts/youtube-zen-source-calibration.md) — semantic calibration title и description перед массовой локализацией YouTube.

## Как работать

### Создать проект

1. Добавьте или проверьте запись в `workspace.yaml`.
2. Создайте `.ai/context.md` в target repository из [`templates/project.md`](templates/project.md).
3. Заполните только устойчивые сведения и при необходимости создайте `.ai/decisions.md`.

### Создать задачу

Для обычной небольшой или средней задачи task directory не создаётся. Sol
возвращает один execution prompt по [`templates/prompt.md`](templates/prompt.md),
а Luna выполняет его в target repository.

Для большой, архитектурной, длительной, межсессионной, audit-значимой или
context-heavy задачи создайте минимальную структуру:

```text
.ai/tasks/<task>/
├── plan.md
├── prompt.md
├── state.md
└── result.md
```

Назначение файлов:

```text
plan.md   = утверждённый intent, scope и architecture
prompt.md = self-contained execution instructions для Luna
state.md  = короткий mutable checkpoint для resume
result.md = финальный outcome задачи
```

`plan.md` не используется как execution scratchpad.

`state.md` должен оставаться коротким. Он хранит только состояние, необходимое
для безопасного продолжения работы: current phase, completed work, changed или
reviewed files, validation status, confirmed findings, необходимые task-local
decisions, next action и blockers.

Не сохраняйте в `state.md` reasoning dumps, raw command output, полный diff,
полный test output или conversation transcript. Устаревшие данные заменяйте
актуальными вместо накопления journal history.

`context.md` не обязателен и добавляется только если есть реальная причина не
дублировать сведения в `plan.md`.

### Promotion lightweight task

Lightweight task может стать persisted, если фактический implementation/review
scope оказался существенно больше ожидаемого и потеря conversation context
затруднит безопасное продолжение.

Promotion выполняется только по однозначному persisted task path из
task-specific prompt. Не создавайте storage location по догадке.

### Продолжить persisted task

После context compaction, interruption или новой Luna session:

1. прочитайте `prompt.md`;
2. прочитайте утверждённый `plan.md`;
3. прочитайте актуальный `state.md`;
4. проверьте текущий target repository `git status` и task-owned diff;
5. продолжите с `state.md` → `Next`.

Не повторяйте уже завершённый broad research или already-reviewed areas без
конкретной причины в текущем diff или confirmed findings.

Conversation history не является source of truth для persisted execution state.

### Сохранить результат

Для persisted task Luna записывает в `result.md` сделанное, изменённые файлы,
проверки и оставшиеся проблемы.

Устойчивые изменения architecture, workflow или conventions переносятся в
project context или `decisions.md`; `tasks/` остаётся историей конкретной работы,
а не постоянным source of truth проекта.

## ChatGPT Web bootstrap

Один раз вставьте следующий текст в Project Instructions ChatGPT Web:

```text
Для software-development tasks используй canonical workflow/context storage:
https://github.com/syllik/ai-workflow

Перед planning прочитай FLOW.md из текущего default branch и следуй его reading
order. Определи target project через projects/index.md, загрузи только relevant
project context и проверь актуальный target GitHub repository по необходимости.

GPT-5.6 Sol — planner, architect и research agent.
Luna xhigh — executor, coder и reviewer.

Sol должен выдать один self-contained execution prompt для Luna. Для long или
context-heavy work используй persisted task state, чтобы выполнение можно было
продолжить без зависимости от conversation history.

Не используй subagents, минимизируй повторное research и context/token usage.
Пользовательские объяснения пиши на русском языке.
```

ChatGPT Web не следует считать автоматически распознающим `AGENTS.md` в этом
repository без такой bootstrap instruction.

Не сохраняйте API keys, passwords, access tokens, refresh tokens, private keys,
содержимое `.env` или другие credentials. См. также [`.gitignore`](.gitignore).
