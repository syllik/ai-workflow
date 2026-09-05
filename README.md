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

Phase 1A includes isolated fixture apply tests. The product supports canonical
apply after normal safety checks; canonical apply was not executed in Phase 1A.

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

1. Если это новая tool/repository, до проектирования проведите актуальный research существующих аналогов, библиотек, сервисов и forkable projects. Проверьте функциональное соответствие, поддержку и license compatibility. Если подходящий проект можно законно и технически корректно форкнуть и дописать, предпочитайте fork + минимальный delta вместо greenfield implementation.
2. До первого commit попросите человека выбрать licensing model и кратко объясните подходящие варианты: permissive (например MIT/Apache-2.0), copyleft, proprietary/rights-reserved или сознательный no-license. Private repository не отменяет этот шаг.
3. Для greenfield repository создайте выбранный `LICENSE` или rights notice одновременно с project bootstrap/template до первого commit. Для fork/derivative сохраните upstream license, copyright, attribution и другие обязательные notices; не перелицензируйте несовместимый upstream code.
4. Добавьте или проверьте запись в `workspace.yaml`.
5. Создайте `.ai/context.md` в target repository из [`templates/project.md`](templates/project.md) и зафиксируйте license/reuse decision.
6. Заполните только устойчивые сведения и при необходимости создайте `.ai/decisions.md`.

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
2. пользователь проверяет human-only `plan.md`; Luna его не читает;
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

## GitHub-only bootstrap

Для software-development tasks достаточно task prompt и GitHub organization
`https://github.com/syllik`; внешняя project configuration не требуется:

```text
Use this canonical workflow/context storage for software-development tasks:
https://github.com/syllik/ai-workflow

Before planning, read FLOW.md from the current default branch and follow its
reading order. Determine the target project through projects/index.md, load
only relevant project context, and verify the current target GitHub repository
when needed.

GPT-5.6 Sol — planner, architect и research agent.
Luna xhigh — executor, coder и reviewer.

Sol must issue one self-contained execution prompt for Luna. For long or
context-heavy work, use persisted task state so execution can continue without
depending on conversation history.

Do not use subagents; minimize repeated research and context/token usage.
The task prompt plus this GitHub repository are sufficient bootstrap.
```

The task prompt and `https://github.com/syllik/ai-workflow` are sufficient to
bootstrap the workflow; do not depend on automatic loading of repository files.

Не сохраняйте API keys, passwords, access tokens, refresh tokens, private keys,
содержимое `.env` или другие credentials. См. также [`.gitignore`](.gitignore).
