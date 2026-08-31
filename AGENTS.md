## `AGENTS.md`

```markdown
# Правила для AI-агентов

## Порядок чтения

`FLOW.md` — canonical entry point для workflow/context storage. Перед работой
прочитайте:

1. `FLOW.md`;
2. `global/context.md`;
3. `global/workflow.md`;
4. `projects/index.md`;
5. `projects/<project>/context.md` для target project;
6. `projects/<project>/decisions.md` только если relevant.

Для persisted task дополнительно используйте его `prompt.md`, утверждённый
`plan.md` и текущий `state.md`. Не перечитывайте task history без необходимости.

Не используйте `AGENTS.md` как единственный bootstrap для ChatGPT Web: для Web
нужна отдельная Project Instructions из README. Не читайте все projects,
prompts, tasks или history без необходимости.

## Основные правила

- GPT-5.6 Sol — planner, architect и research agent; он выпускает один self-contained execution prompt.
- Luna xhigh — executor, coder и reviewer; она читает target repository instructions, реализует, проверяет и смотрит diff.
- Lightweight task — default: task files не обязательны.
- Persisted task используется для большой, архитектурной, длительной, межсессионной, audit-значимой или context-heavy работы.
- Default persisted structure: `plan.md`, `prompt.md`, `state.md`, `result.md`.
- Lightweight task может быть promoted to persisted, если фактический implementation/review scope становится context-heavy.
- `plan.md` хранит утверждённый intent, scope и architecture; не используйте его как mutable execution scratchpad.
- `state.md` — короткий mutable checkpoint для безопасного продолжения работы; не превращайте его в journal, reasoning dump, raw log или полный diff.
- Conversation context не должен быть единственным источником execution state для persisted task.
- Task `context.md` optional и не должен дублировать `plan.md`.
- Если существует утверждённый `plan.md`, не меняйте архитектуру без явной причины.
- Не используйте subagents, не повторяйте broad research и не расширяйте scope.
- Luna может commit, push task branch и открыть/update PR только при разрешении; Luna never merges и never pushes directly to `dev`/`main`.
- Не создавайте лишнюю документацию и unrelated refactoring.
- Обновляйте canonical project context только при появлении устойчивого знания.
- Никогда не сохраняйте secrets, credentials, tokens, private keys или содержимое `.env`.
- Пользовательские объяснения и документацию пишите на русском; technical identifiers оставляйте на английском, если это естественно.
```

---

## `FLOW.md`

````markdown
# Canonical workflow

Этот repository — canonical storage для workflow и устойчивого AI-контекста.
Используйте только необходимый context; актуальное состояние кода проверяется
в target repository.

## Precedence

```text
global workflow
→ project context / applicable decisions
→ target repository AGENTS.md + relevant rules
→ task-specific prompt
````

Global workflow owns the generic lifecycle. Project context and applicable
decisions own durable project facts. The target repository owns local
architecture and invariants. The task prompt owns task-specific scope and
validation. Lower-precedence instructions cannot silently weaken higher-
precedence requirements.

Определяйте target project по задаче и `projects/index.md`. Не читайте весь
storage без необходимости.

GPT-5.6 Sol отвечает за planning, architecture, research, scope и validation.
Результат Sol — self-contained execution prompt для Luna xhigh. Luna отвечает
за implementation, tests/checks, bounded review, commit, push task branch и PR,
если это разрешено prompt и target workflow repository.

Короткая integration sequence:

```text
task branch → implementation → targeted validation → bounded diff review
→ cross-file integration review → full local completion gate → commit
→ pre-push repeats the local gate → push task branch → open/update PR
→ required remote CI green
→ READY FOR HUMAN MERGE → human merges into integration branch
```

Local completion gate проверяет task в checkout до commit/push. Authoritative
remote integration gate — это существующий PR в integration branch и green
required CI; local green сам по себе не означает readiness to merge.

Integration branch берётся из project context и target repository rules, а не из
GitHub repository default branch. Для `ChipIn-one/chipin-frontend` integration
branch — `dev`, хотя repository default branch остаётся `main`.

Luna never merges integration branches and never pushes directly to `dev` или
`main`. Human performs the merge after the authoritative remote gate is green.

Long или context-heavy execution использует persisted task state, чтобы Luna
могла продолжить работу из repository files без зависимости от conversation
history.

Subagents запрещены. Повторное research и загрузку контекста минимизируйте.

````

---

## `global/workflow.md`

```markdown
# Workflow

## Основной процесс

`FLOW.md` — короткий bootstrap. Полный рабочий путь:

```text
User task
→ Sol plan/prompt
→ Luna reads necessary context
→ bounded implementation phases
→ targeted validation and fixes
→ bounded diff review
→ short cross-file integration pass when needed
→ full local completion gate
→ stage task-owned files
→ commit
→ pre-push repeats the local gate
→ push task branch
→ open/update PR into integration branch
→ wait/check required remote CI
→ if green: READY FOR HUMAN MERGE
→ human merges integration branch
````

Для небольшой задачи implementation и review могут оставаться одним bounded
phase. Не создавайте ceremony там, где задача помещается в безопасный рабочий
контекст.

Порядок контекста: global workflow → project context / decisions → target
`AGENTS.md` и релевантные rules → task-specific prompt.

## Роли

Sol — planner, architect и research agent. Он выдаёт self-contained prompt.

Luna — executor, coder и reviewer: реализует scope, валидирует, исправляет,
просматривает полный task-owned diff, делает commit, push task branch и PR
только при разрешении. Luna never merges integration branches and never pushes
directly to `dev`/`main`; human performs the merge.

Subagents запрещены. Luna не повторяет broad research Sol, не перечитывает весь
storage, не перепроектирует задачу и не делает unrelated refactoring.

Обычный lifecycle не требует user-controlled staging, staged approval,
subagent review или обязательного ручного approval в середине реализации.

## Gates

### Local completion gate

Target repository's full local command checks the task before commit/push. A
tracked `pre-push` hook may repeat this command and must block the push on a
non-zero result. Local green is necessary but does not authorize integration.

### Authoritative remote integration gate

The task branch must be pushed and have an open or updated PR into the
integration branch. Required CI for that PR must be green before the task is
reported as ready for integration. Remote CI is authoritative for integration
readiness; preview/deployment signals do not replace it. The PR base must be
the integration branch declared by the target project's rules, never the
GitHub repository default branch. Only a human merges the integration branch.

## Bounded failure diagnosis

If targeted validation, the local completion gate, a pre-push hook, or required
remote CI fails, Luna performs one bounded diagnosis pass only. It may read the
failed command's stdout/stderr, `git status`, the task diff, files named in the
error stack, and directly related touched files; make one obvious task-local
correction; rerun the specific failed check; and, after a fix, rerun the
necessary completion gate.

Without a separate user/Sol request, Luna must not do web research, broad
GitHub/repository exploration, reread all prompt storage, investigate unrelated
modules, perform architecture research, make multiple speculative fix attempts,
or use subagents. If the cause is not obvious, environment-specific and needs
separate investigation, unrelated, or the first bounded correction does not
help, Luna stops and reports the failing check, key error, suspected file/root
cause, checks performed, attempted correction, and escalation reason.

## Lightweight и persisted tasks

Lightweight task — default. Обычные небольшие и средние задачи не требуют task
files.

Persisted task используется, если работа:

* большая;
* архитектурная;
* длительная или межсессионная;
* audit-значимая;
* либо implementation/review создаёт настолько большой context footprint, что
  потеря conversation context затруднит безопасное продолжение.

Default structure:

```text
projects/<project>/tasks/<task>/
├── plan.md
├── prompt.md
├── state.md
└── result.md
```

`plan.md` хранит утверждённый intent, scope и architecture.

`prompt.md` хранит self-contained execution instructions для Luna.

`state.md` хранит только короткое mutable execution state, необходимое для
продолжения работы.

`result.md` хранит финальный outcome после завершения задачи.

`plan.md` не используется как execution scratchpad. `state.md` не является
journal, reasoning dump, raw command log, test-output dump или копией diff.

Conversation context никогда не должен быть единственным источником execution
state для persisted task.

## Promotion to persisted

Lightweight task может быть promoted to persisted во время выполнения, если
фактический scope оказывается существенно больше ожидаемого: растёт repository
exploration, количество связанных изменений, validation/fix cycles или review
scope.

Promotion выполняется только когда task-specific prompt задаёт допустимый
persisted task path или иной однозначный способ сохранить task state. Не
придумывайте путь или storage location.

После promotion дальнейшая работа следует persisted lifecycle.

## Checkpoints

Для persisted task Luna обновляет `state.md` только на meaningful boundaries:

* после repository reconnaissance, если появились важные task-local findings;
* после каждого значимого implementation phase;
* после существенного validation/fix cycle;
* после каждого bounded review batch;
* перед final completion/commit, если предыдущий checkpoint устарел.

Не обновляйте checkpoint после каждого файла или команды.

Checkpoint должен позволять определить:

* текущую phase;
* что уже завершено;
* какие task-owned files изменены или reviewed;
* какие validation checks уже выполнены и их outcome;
* подтверждённые findings;
* task-local decisions или assumptions, необходимые для продолжения;
* следующий конкретный action;
* blockers.

Устаревшее состояние заменяется актуальным вместо бесконечного добавления
истории.

## Review

Luna должна просмотреть полный task-owned diff.

Небольшой diff можно review как одну bounded unit.

Non-trivial diff разбивается на coherent batches по architecture, feature,
state/data-flow или другой реальной связи. Не делите review механически по
произвольному количеству файлов.

После каждого batch persisted task фиксирует reviewed files и confirmed findings
в `state.md`.

После завершения всех batches выполняется короткий cross-file integration pass
только по зависимостям и рискам между уже reviewed areas. Не нужно повторно
читать весь diff без причины.

## Recovery

После context compaction, interruption или новой Luna session:

1. прочитайте task `prompt.md`;
2. прочитайте утверждённый `plan.md`;
3. прочитайте актуальный `state.md`;
4. проверьте текущий target repository `git status` и task-owned diff;
5. продолжите с `state.md` → `Next`.

Не повторяйте завершённый broad research, implementation reconnaissance или
already-reviewed batches, если текущий diff или confirmed finding не требует
повторной проверки.

Если conversation memory расходится с persisted state или текущим repository,
используйте approved plan, persisted task state и фактическое состояние Git, а
не догадку по памяти.

## Completion

После implementation, validation и review Luna запускает полный completion gate,
фиксирует финальный результат в `result.md` для persisted task и обновляет
устойчивый project context или decisions только если появилось действительно
durable знание.

Stage только task-owned files. Commit, push и PR выполняются только если это
разрешено task-specific prompt и target repository workflow.

Luna никогда не merge и не включает auto-merge.

Credentials, secrets, tokens, private keys и содержимое `.env` никогда не
сохраняются в task state или других workflow files.

```
```
