# AI workflow

Этот repository хранит canonical AI workflow, устойчивый project context,
решения и короткие reusable prompts для независимых агентных ролей. Полные дампы
разговоров и секреты здесь не сохраняются.

Начинайте с [`AI.md`](AI.md), затем читайте [`FLOW.md`](FLOW.md). Они задают стабильный bootstrap и не заменяют
проверку актуального target GitHub repository.

## GitHub-rooted foundation

`workspace.yaml` is the canonical project manifest and `projects/index.md` is
its generated navigation. Resolve target files from the record's
`integrationBranch`. Active managed projects route to repository context;
onboarding projects are limited to onboarding/alignment until that context
exists. Optional `contextDependencies` are explicit read-only context sources,
loaded only when required. Legacy central project contexts remain migration-only.

The audited Git lifecycle is defined in `workspace.yaml.gitLifecycle` and documented in
[`docs/git-workflow.md`](docs/git-workflow.md). Only listed repositories are lifecycle-audited;
all other workspace records remain unverified for branch/merge migration state.

### Retired runner reference

`syllik/codex-local-runner` was retired on 2026-10-10 and removed from executable
workspace routing. Its original repository remains private and archived; the
separate `codex-local-runner-control` repository was already deleted on 2026-09-06.
The local service account, runner data, GitHub runner registrations and dedicated
runner/publisher Apps were removed.

The public [MIT source archive](https://github.com/syllik/codex-local-runner-archive)
at `tools/ai/codex-local-runner-archive` is historical reference for
[Deep Dark Factory](https://github.com/syllik/deep-dark-factory), with
[reuse lessons](https://github.com/syllik/codex-local-runner-archive/blob/master/docs/DDF-LESSONS.md)
and a [dependency audit](https://github.com/syllik/codex-local-runner-archive/blob/master/docs/DEPENDENCY-AUDIT.md).
It is intentionally excluded from `workspace.yaml`: schema v2 has only active
and onboarding states, neither of which represents a retired runtime. The archive
grants no execution, publication or management authority. Resolve the documented
dependency vulnerabilities before reusing its code in a maintained runtime.

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

## Что читает Planner / Architect

Planner или Architect читает `AI.md`, `FLOW.md`, одну запись `workspace.yaml` / `projects/index.md`,
релевантный role file, затем `AGENTS.md` и `.ai/context.md` target repository
на указанной в записи `integrationBranch`.
`.ai/decisions.md` и task files читаются только при релевантности. Legacy
central project contexts сохраняются для migration, но не являются active path.

## Передача задачи Executor

Planner готовит один self-contained handoff для роли Executor с scope,
approval, разрешёнными путями, текущими SHA и проверками. Executor читает
инструкции target repository, реализует утверждённую задачу и останавливается
на `IMPLEMENTATION_COMPLETE` или `BLOCKED`. Провайдер, модель и runtime
выбираются по возможностям и риску, не по названию роли; выбор модели не
расширяет полномочия. Executor не выполняет self-review, commit, push, PR
publication или merge. Отдельный Trusted Publisher публикует только явно
разрешённые изменения.

Для persisted task Executor использует durable `state.md` для продолжения
после compaction, interruption или новой session без зависимости от истории
разговора.

## Как проходит code review

1. После локальных проверок авторизованный Trusted Publisher создаёт или обновляет PR.
2. Открытие PR, Ready и push не должны автоматически запускать единственное ревью.
3. Требуемый repository-defined CI должен завершиться зелёным на точном текущем head SHA.
4. Явно запускается один независимый read-only Reviewer для этого SHA. Провайдер выбирается по возможностям, доступности и риску; Executor, Publisher и Reviewer сохраняют раздельные полномочия.
5. Reviewer работает только в read-only режиме: не вызывает branch-mutation команды и не изменяет ветку; findings возвращаются одним consolidated package.
6. Изменение head инвалидирует прежние CI/review evidence; новое ревью требует свежего зелёного CI.
7. Corrections выполняет Executor только в пределах v2 upfront approval (не более двух batches) либо после отдельного human approval для legacy. Спорные findings и превышение лимита направляются человеку.
8. Merge выполняет только человек.

## Структура

* [`global/context.md`](global/context.md) — постоянные правила для всех проектов.
* [`global/workflow.md`](global/workflow.md) — роли и lifecycle задач.
* [`projects/index.md`](projects/index.md) — generated GitHub repository registry.
* [`projects/README.md`](projects/README.md) — migration-only legacy storage pointer.
* `.ai/tasks/` — persisted task state for this repository.
* `prompts/` — короткие reusable prompts.
* `templates/` — минимальные заготовки для contexts, prompts, task state и результатов.
* [`AGENTS.md`](AGENTS.md) — правила для агентов, работающих непосредственно здесь; [`CLAUDE.md`](CLAUDE.md) импортирует его для Claude Code.

### Reusable prompts

* [`implementation.md`](prompts/implementation.md) — базовые execution rules для роли Executor.
* [`code-review.md`](prompts/code-review.md) — provider-independent prompt для независимого Reviewer.
* [`youtube-zen-source-calibration.md`](prompts/youtube-zen-source-calibration.md) — semantic calibration title и description перед массовой локализацией YouTube.

## Как работать

### Создать проект

1. Если это новая tool/repository, до проектирования проведите актуальный research существующих аналогов, библиотек, сервисов и forkable projects. Проверьте функциональное соответствие, поддержку и license compatibility. Если подходящий проект можно законно и технически корректно форкнуть и дописать, предпочитайте fork + минимальный delta вместо greenfield implementation.
2. До первого commit попросите человека выбрать licensing model и кратко объясните подходящие варианты: permissive (например MIT/Apache-2.0), copyleft, proprietary/rights-reserved или сознательный no-license. Private repository не отменяет этот шаг.
3. Для greenfield repository создайте выбранный `LICENSE` или rights notice одновременно с project bootstrap/template до первого commit. Для fork/derivative сохраните upstream license, copyright, attribution и другие обязательные notices; не перелицензируйте несовместимый upstream code.
4. Добавьте или проверьте запись в `workspace.yaml`. Если repository входит в lifecycle-audit scope, добавьте/обновите его `gitLifecycle` record с deployment profile и фактическим branch state; не помечайте legacy branch canonical и не переименовывайте branch в рамках onboarding-policy change.
5. Создайте или обновите связанный change в `syllik/syllik`: `docs/workspace.md` и `docs/repositories.md`. PR с изменением `workspace.yaml` не считается готовым к human merge, пока синхронизирующий workspace-documentation change не существует и не соответствует ему. Profile `README.md` содержит стабильную ссылку на `docs/workspace.md` и не дублирует список проектов; исключение из workspace documentation требует явного решения человека.
6. Создайте `.ai/context.md` в target repository из [`templates/project.md`](templates/project.md) и зафиксируйте license/reuse decision.
7. Убедитесь, что в target repository есть `AGENTS.md` с managed-блоком `agents-routing` и `CLAUDE.md` с managed-блоком `claude-routing` (`@AGENTS.md`), чтобы Claude Code агенты получали тот же routing, что и Codex. `node scripts/workspace/cli.mjs apply` создаёт оба файла для managed projects, а `check` считает их отсутствие drift.
8. Заполните только устойчивые сведения и при необходимости создайте `.ai/decisions.md`.

### Создать задачу

Для обычной небольшой или средней задачи task directory не создаётся. Planner
возвращает один execution prompt по [`templates/prompt.md`](templates/prompt.md),
а Executor выполняет его в target repository.

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
prompt.md = self-contained execution instructions для Executor
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

После context compaction, interruption или новой Executor session:

1. прочитайте `prompt.md`;
2. пользователь проверяет human-only `plan.md`; Executor его не читает;
3. прочитайте актуальный `state.md`;
4. проверьте текущий target repository `git status` и task-owned diff;
5. продолжите с `state.md` → `Next`.

Не повторяйте уже завершённый broad research или already-reviewed areas без
конкретной причины в текущем diff или confirmed findings.

Conversation history не является source of truth для persisted execution state.

### Сохранить результат

Для persisted task Executor записывает в `result.md` сделанное, изменённые файлы,
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

Roles are provider-independent: Planner scopes and researches; Architect is
risk-triggered; Executor implements and validates; Reviewer independently
reviews the exact approved PR head; Auditor evaluates evidence. Trusted
Publisher is a separate capability. Select provider/model/runtime by task
capabilities and risk, never by a fixed model-to-role mapping. Preserve
explicit approval, exact provenance, required green CI before review,
bounded corrections, and human-only merge.

Planner supplies a self-contained Executor handoff; persisted task state
supports continuation without depending on conversation history.

Use subagents only under the delegation rules in `global/core.md`; minimize
repeated research and context/token usage.
The task prompt plus this GitHub repository are sufficient bootstrap.
```

The task prompt and `https://github.com/syllik/ai-workflow` are sufficient to
bootstrap the workflow; do not depend on automatic loading of repository files.

Не сохраняйте API keys, passwords, access tokens, refresh tokens, private keys,
содержимое `.env` или другие credentials. См. также [`.gitignore`](.gitignore).
