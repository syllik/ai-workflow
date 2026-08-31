# Workflow

## Основной процесс

`FLOW.md` — короткий bootstrap. Полный рабочий путь:

```text
User task
→ Sol plan/prompt
→ Luna reads necessary context
→ bounded implementation phases
→ targeted validation and fixes
→ bounded full task-owned diff review
→ short cross-file integration pass when needed
→ full local completion gate
→ stage task-owned files
→ commit
→ target-repository pre-push gate when defined
→ push authorized task branch
→ open/update PR into project-declared integration branch
→ required remote CI
→ READY FOR HUMAN MERGE
→ human merge
```

Для небольшой задачи implementation и review могут оставаться одним bounded
phase. Не создавайте ceremony там, где задача помещается в безопасный рабочий
контекст.

Порядок контекста: global workflow → project context / decisions → target
`AGENTS.md` и релевантные rules → task-specific prompt.

## Роли

Sol — planner, architect и research agent. Он выдаёт self-contained prompt.

Luna — executor, coder и reviewer: реализует scope, валидирует, исправляет,
просматривает полный task-owned diff, делает commit, push authorized task
branch и открывает или обновляет PR только при разрешении task/project workflow.
Luna never merges и never enables auto-merge.

Subagents запрещены. Luna не повторяет broad research Sol, не перечитывает весь
storage, не перепроектирует задачу и не делает unrelated refactoring.

Обычный lifecycle не требует user-controlled staging, staged approval,
subagent review или обязательного ручного approval в середине реализации.

## Gates

### Local completion gate

Target repository's full local command checks the task before commit/push. A
tracked `pre-push` gate may repeat this command and must block the push on a
non-zero result. Local green is necessary but does not by itself establish
integration readiness.

### Authoritative remote integration gate

The task branch must have an open or updated PR into the integration branch
declared by project context and target repository rules. If the project or
target repository defines required remote CI, that deterministic CI must be
green before the task is reported as ready for integration. Remote CI is
authoritative for integration readiness; preview/deployment signals do not
replace it. The GitHub repository default branch does not implicitly define the
PR target. Only a human merges the integration branch.

## Bounded failure diagnosis

If targeted validation, the local completion gate, target-repository pre-push
validation, or required remote CI fails, Luna performs one bounded diagnosis
pass only. It may read the failed command's stdout/stderr, `git status`, the
task-owned diff, files named in the error stack, and directly related touched
files; make one obvious task-local correction; rerun the specific failed check;
and, after a fix, rerun the necessary completion gate.

Without a separate user/Sol request, Luna must not:

* perform web research;
* perform broad GitHub/repository exploration;
* reread all prompt storage;
* inspect unrelated modules;
* perform architecture research;
* make multiple speculative fix attempts;
* use subagents.

If the cause is not obvious, environment-specific and needs separate
investigation, unrelated, or the first bounded correction does not help, Luna
stops and reports the failing check, key error, suspected file/root cause,
checks performed, attempted correction, and escalation reason.

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
фактический scope становится существенно больше ожидаемого: растёт repository
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

После завершения всех review batches выполняется короткий cross-file integration
pass только по зависимостям и рискам между уже reviewed areas. Не нужно повторно
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
