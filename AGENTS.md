# Правила для AI-агентов

## Порядок чтения

`AI.md` и `FLOW.md` — canonical entry points для workflow/context storage. Перед
работой прочитайте:

1. `AI.md`;
2. `FLOW.md`;
3. одну запись `workspace.yaml` и `projects/index.md`;
4. релевантный role file из `global/architect.md` или `global/executor.md`;
5. `AGENTS.md` и `.ai/context.md` target repository;
6. только релевантные `.ai/decisions.md` и task files.

Для persisted task дополнительно используйте его `prompt.md` и текущий
`state.md`; human-only `plan.md` читайте только если task prompt разрешает.
Не перечитывайте task history без необходимости.

Не используйте `AGENTS.md` как единственный bootstrap для ChatGPT Web: для Web
нужна отдельная Project Instructions из README. Не читайте все projects,
prompts, tasks или history без необходимости.

## Основные правила

* GPT-5.6 Sol — planner, architect и research agent; он выпускает один self-contained execution prompt.
* Luna xhigh — executor, coder и reviewer; она читает target repository instructions, реализует, проверяет и смотрит diff.
* Lightweight task — default: task files не обязательны.
* Persisted task используется для большой, архитектурной, длительной, межсессионной, audit-значимой или context-heavy работы.
* Default persisted structure: `plan.md`, `prompt.md`, `state.md`, `result.md`.
* Lightweight task может быть promoted to persisted, если фактический implementation/review scope становится context-heavy.
* `plan.md` хранит утверждённый intent, scope и architecture; не используйте его как mutable execution scratchpad.
* `state.md` — короткий mutable checkpoint для безопасного продолжения работы; не превращайте его в journal, reasoning dump, raw log или полный diff.
* Conversation context не должен быть единственным источником execution state для persisted task.
* Task `context.md` optional и не должен дублировать `plan.md`.
* Если существует утверждённый `plan.md`, не меняйте архитектуру без явной причины.
* Не используйте subagents, не повторяйте broad research и не расширяйте scope.
* Luna может stage task-owned files, commit, push an authorized task branch и open/update PR, если это разрешено task/project workflow; Luna never merges и never enables auto-merge.
* Не создавайте лишнюю документацию и unrelated refactoring.
* Обновляйте canonical project context только при появлении устойчивого знания.
* Никогда не сохраняйте secrets, credentials, tokens, private keys или содержимое `.env`.
* Пользовательские объяснения и документацию пишите на русском; technical identifiers оставляйте на английском, если это естественно.
<!-- ai-workflow:agents-routing:start -->
Canonical AI routing:
1. Read `FLOW.md`.
2. Select one GitHub record from `workspace.yaml` / `projects/index.md`.
3. Read role rules from `global/architect.md` or `global/executor.md`.
4. Read target `AGENTS.md`, then target `.ai/context.md`.
5. Read only relevant `.ai/decisions.md` and task files.

Use GitHub records only. Legacy `projects/<project>/` contexts are migration-only; do not auto-discover repositories.
Canonical root: ~/Desktop/WORK
<!-- ai-workflow:agents-routing:end -->
