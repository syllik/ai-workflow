# Архитектура GitHub-rooted AI workflow

**Статус:** утверждено пользователем  
**Дата:** 2026-09-03  
**Target repository:** `syllik/ai-workflow`  
**Task:** `github-rooted-agent-architecture`

## Цель

Сделать `https://github.com/syllik` постоянной и достаточной точкой входа для GPT-5.6 Sol. Sol выполняет архитектуру, planning, research и validation, используя текущую задачу и канонические GitHub-файлы, затем передаёт immutable execution contract локальному Luna xhigh через GitHub Issue queue.

Встроенная GPT memory не является источником истины и не должна требоваться для работы. В GitHub сохраняются только workflow, технические решения и контексты проектов. Личная память, разговоры и чувствительные сведения исключены.

## Основные решения

- Один Git repository является одной project unit.
- `syllik/syllik` — публичная входная точка и human navigation.
- `syllik/ai-workflow` — global workflow, manifest, templates, generator и validator.
- Каждый writable target repository владеет своим project context, decisions и task history.
- Новый repository добавляется только после явного подтверждения пользователя.
- Все approved writable repositories получают единый AI contract.
- `ChipIn-one/chipin-backend` имеет строгий режим `read-only`.
- Subagents запрещены.
- Monorepo и Git submodules не используются.
- Human выполняет merge; Luna никогда не merge и не включает auto-merge.
- Trello может быть только необязательным зеркалом, но не source of truth.

## Вход и маршрутизация

Постоянный bootstrap:

```text
https://github.com/syllik + user task
→ syllik/syllik/AI.md
→ syllik/ai-workflow/FLOW.md
→ workspace.yaml
→ target repository AGENTS.md
→ target .ai/context.md
```

`syllik/syllik/README.md` содержит заметную ссылку `🤖 AI entry point`. Короткий `AI.md` направляет Sol в `ai-workflow/FLOW.md` и запрещает предполагать наличие conversation history или встроенной памяти.

Sol загружает только сведения, необходимые выбранному target. Он не читает все projects, decisions, tasks или repositories.

## Владение файлами

`syllik/ai-workflow` хранит:

```text
FLOW.md
workspace.yaml
global/
templates/
scripts/
```

Project facts и новые task histories в центральном repository не хранятся.

Каждый `managed` repository хранит:

```text
AGENTS.md
.ai/
├── context.md
├── decisions.md
└── tasks/<task-id>/
    ├── plan.md
    ├── prompt.md
    ├── state.md
    └── result.md
```

Назначение:

- `plan.md` — утверждённый план на русском языке только для пользователя.
- `prompt.md` — self-contained English execution contract для Luna.
- `state.md` — короткий English mutable checkpoint для resume.
- `result.md` — English terminal outcome до `READY_FOR_HUMAN_MERGE`.

Luna не читает `plan.md`. При resume она читает `prompt.md`, `state.md` и проверяет фактическое состояние Git.

Existing `AGENTS.md` не перезаписывается. Generator управляет только компактным routing block и сохраняет repository-local rules.

## Canonical manifest

`workspace.yaml` — единственный источник intended workspace mapping. Одна запись содержит:

- стабильный `id`;
- canonical `repository` в формате `owner/name`;
- `localPath` относительно `~/Desktop/WORK`;
- purpose-first `group`;
- `access: managed | read-only`;
- `status: onboarding | active`;
- `contextPath: .ai/context.md` только для `managed`.

Default branch, integration branch, completion gates и project-specific conventions хранятся в target `.ai/context.md`, а не дублируются в manifest.

Новый approved managed repository начинается со `status: onboarding`: generator может подготовить contract, но runner не принимает для него задачи. После merge onboarding PR и успешной проверки status меняется на `active`. Queue разрешена только для `access: managed` вместе со `status: active`.

Repositories вне explicit allowlist не обнаруживаются и не добавляются автоматически. Tangem repositories и любые другие excluded repositories не перемещаются, не изменяются и не документируются новым workflow.

## Read-only backend

Для `ChipIn-one/chipin-backend`:

- Sol может выполнять только необходимое чтение;
- generator не создаёт `.ai/` и не меняет `AGENTS.md`;
- runner отклоняет backend как write target до платного запуска;
- Luna не создаёт branch, files, commit, push, PR или Issue в backend;
- backend repository остаётся единственным источником его фактического состояния;
- отдельная копия backend technical memory не создаётся.

## Воспроизводимость workspace

Generator в `syllik/ai-workflow` предоставляет:

- `workspace check` — schema, duplicates, routes, budgets и generated drift;
- `workspace plan` — read-only перечень предполагаемых операций;
- `workspace apply` — clone отсутствующих allowlisted repositories и scaffold отсутствующего managed AI contract.

`workspace apply`:

- работает только по explicit manifest;
- не выполняет delete, move, reset, clean, stash или overwrite;
- останавливается при path, remote, branch или worktree collision;
- не изменяет `read-only` repositories;
- не заменяет заполненные context/decisions;
- является idempotent: повторный запуск на согласованном workspace не создаёт diff.

Profile navigation и компактный project index генерируются из manifest и не редактируются вручную.

## Lazy-loading contract

Sol читает:

1. profile `AI.md`;
2. `ai-workflow/FLOW.md`;
3. matching manifest entry;
4. global architect rules;
5. target `AGENTS.md` и `.ai/context.md`;
6. только relevant decisions и repository files.

Luna читает:

1. target `AGENTS.md`;
2. task `prompt.md`;
3. `state.md` только при resume;
4. указанные code areas и полный task-owned diff.

Luna не читает весь manifest, global storage, human `plan.md` или task history.

## Hard context budgets

Validator измеряет UTF-8 bytes и блокирует queue handoff при превышении:

| Artifact | Maximum |
| --- | ---: |
| profile `AI.md` | 1 KB |
| `FLOW.md` | 2 KB |
| один global role file | 6 KB |
| managed routing block в `AGENTS.md` | 1 KB |
| `.ai/context.md` | 8 KB |
| один decision record | 4 KB |
| `prompt.md` | 8 KB |
| `state.md` | 2 KB |
| `result.md` | 4 KB |
| human-only `plan.md` | 16 KB |

Превышение устраняется удалением дублирования или разделением на адресные файлы. Разделение не разрешает агенту читать все fragments автоматически.

Если доступный context window можно оценить, Sol предупреждает пользователя примерно на 70%, сохраняет уже утверждённое состояние в GitHub и не полагается на дальнейшую историю разговора.

## Risk classification и approval

Sol присваивает один режим:

- `routine` — bounded изменение внутри существующей архитектуры; handoff публикуется без отдельного approval;
- `approval-required` — пользователь сначала утверждает русский plan.

`approval-required` обязателен при изменении architecture, public API, auth/security, data или migrations, dependencies, CI/deployment, нескольких repositories, destructive operations или неопределённом scope.

После необходимого approval Sol автоматически:

1. создаёт authorized task branch;
2. записывает `plan.md`, `prompt.md` и начальный `state.md`;
3. фиксирует immutable handoff commit;
4. создаёт центральную queue Issue.

## Queue contract

Центральная Issue в `syllik/codex-local-runner` содержит только:

```yaml
task: <task-id>
repository: <owner/name>
branch: <task-branch>
handoffCommit: <immutable-sha>
prompt: .ai/tasks/<task-id>/prompt.md
```

До платного запуска runner проверяет:

- target имеет manifest `access: managed` и `status: active`;
- SHA, branch и prompt существуют и согласованы;
- base не устарел;
- hard budgets соблюдены;
- task ещё не claimed;
- target не является `read-only`.

Claim выполняется атомарно: `agent:ready → agent:running`. На одну постановку разрешена ровно одна Luna xhigh execution; автоматического retry нет.

## Luna lifecycle

Luna:

1. потребляет утверждённый prompt без broad replanning;
2. сохраняет unrelated work;
3. обновляет `state.md` только на meaningful boundaries;
4. реализует bounded scope;
5. выполняет targeted checks и full local completion gate;
6. просматривает полный task-owned diff;
7. stage/commit/push выполняет только в authorized task branch;
8. открывает или обновляет PR в явно заданную integration branch;
9. проверяет required remote CI;
10. останавливается на `READY_FOR_HUMAN_MERGE`.

Luna никогда не push напрямую в protected integration/release branches, не merge и не включает auto-merge.

При stale base, contract mismatch, неоднозначности, невозможности доказать GitHub transition или failure после одного obvious bounded task-local fix runner выполняет safe stop. Возобновление требует явного решения Sol или пользователя.

Task MD state заканчивается на `READY_FOR_HUMAN_MERGE`. После human merge GitHub PR/Issue является единственным источником фактического статуса. Queue Issue закрывается без переписывания task files.

## Поэтапный rollout

### Phase 1A — Workflow foundation

В `syllik/ai-workflow`:

- добавить manifest, global role files, generator и validator;
- добавить новый `.ai/` contract;
- временно оставить старое `projects/` как явно не загружаемый legacy storage;
- подготовить deterministic profile/workspace outputs from manifest.

Phase 1A выполняется одной ручной Luna xhigh session и отдельным PR.

### Phase 1B — Profile entry

В `syllik/syllik`:

- добавить profile `AI.md`;
- применить generated profile/workspace navigation;
- проверить, что `https://github.com/syllik` детерминированно ведёт в новый workflow.

Phase 1B выполняется второй ручной Luna xhigh session и отдельным PR после human merge Phase 1A. Текущий runner не используется, поскольку он ещё привязан к `chipin-frontend`.

### Phase 2 — Generalize runner

- убрать fixed target;
- реализовать immutable Issue contract;
- разрешать только manifest `managed` targets;
- проверять budgets, base SHA, branch и prompt;
- довести lifecycle до push, PR, required CI и `READY_FOR_HUMAN_MERGE`;
- сохранить single-run, safe-stop, no-merge и no-auto-merge invariants.

### Phase 3 — Repository onboarding

Создать отдельный onboarding PR для каждого writable repository:

- `syllik/syllik`;
- `syllik/ai-workflow`;
- `syllik/codex-local-runner`;
- `syllik/chatgpt-archive-cleanup`;
- `syllik/youtube-metadata-translator`;
- `syllik/gpg-signed-commits`;
- `ChipIn-one/chipin-frontend`.

Для каждого добавляются или дополняются `AGENTS.md`, `.ai/context.md` и `.ai/decisions.md`. После подтверждённой миграции active legacy project routing удаляется из `ai-workflow`.

`ChipIn-one/chipin-backend` только проверяется как `read-only`; никаких write operations не выполняется.

Каждая repository task использует отдельные branch и PR. Phase 1B начинается только после фактической проверки и human merge Phase 1A; последующие phases также выполняются последовательно.

## Verification

Обязательны:

- manifest schema и duplicate tests;
- generator idempotency;
- проверки отсутствия delete/move/overwrite;
- negative tests для `read-only` backend;
- generated Markdown drift check;
- hard budget tests;
- immutable Issue contract tests;
- atomic claim tests;
- stale-base rejection до Luna invocation;
- fixture tests без изменения реальных repositories;
- полный dry-run от profile bootstrap до точки вызова Luna;
- bounded full diff review для каждой phase.

## Non-goals

- хранение личной GPT memory или conversation dumps;
- автоматическое добавление GitHub repositories;
- изменение backend;
- изменение excluded repositories;
- monorepo или submodules;
- автоматические merge или auto-merge;
- бесконтрольные retries;
- обязательная зависимость от Trello;
- копирование полного global workflow в каждый repository.

## Критерии готовности архитектуры

Архитектура завершена, когда новый Sol session может получить только `https://github.com/syllik` и задачу, детерминированно найти target context без встроенной памяти, создать bounded immutable handoff, а generalized runner — безопасно передать его Luna. Добавление approved project выполняется одной manifest entry и безопасным generator flow; повторный `workspace apply` не создаёт изменений.
