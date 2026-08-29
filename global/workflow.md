# Workflow

## Основной процесс

`FLOW.md` — короткий bootstrap. Полный рабочий путь:

```text
User task
↓
GPT-5.6 Sol читает canonical context
↓
Определение target project и проверка target repository
↓
Research / architecture / decisions / validation
↓
Один self-contained execution prompt
↓
Luna xhigh читает target instructions и реализует scope
↓
Tests/checks → diff review → commit → push по разрешению
↓
При необходимости обновление canonical project context
```

Порядок чтения: `FLOW.md` → `global/context.md` → `global/workflow.md` →
`projects/index.md` → context выбранного проекта → релевантный `decisions.md` →
актуальный target repository. Не загружайте весь storage или history без
необходимости.

## Роли

Sol — planner, architect и research agent. Он определяет target, scope,
решения и validation, затем выдаёт один self-contained prompt для Luna.

Luna — executor, coder и reviewer. Она читает `AGENTS.md` и local instructions
target repository, проверяет необходимые предположения, реализует prompt,
запускает relevant checks, смотрит итоговый diff, исправляет проблемы и делает
commit/push только в пределах разрешённого workflow.

Subagents запрещены. Luna не повторяет broad research Sol, не перечитывает весь
`my-prompt-storage`, не перепроектирует задачу и не делает unrelated refactoring.

## Lifecycle задачи

### Lightweight task — default

Для обычной задачи не создавайте task directory и четыре файла. Достаточно:

```text
User task → Sol context/research → один Luna prompt → Luna implementation/review
```

### Persisted task — по необходимости

Создавайте `projects/<project>/tasks/<task>/` только для большой,
архитектурной, длительной, межсессионной или audit-значимой работы:

```text
plan.md
prompt.md
result.md
```

Task `context.md` optional и нужен только при реальной причине, если сведения
нельзя ясно держать в `plan.md`.

После завершения переносите в project context или `decisions.md` только знания,
которые устойчивы и полезны для будущих задач. Не сохраняйте credentials,
secrets, tokens, private keys или `.env`.

Если задача изменила архитектуру, workflow, conventions или другое устойчивое состояние, обновите `projects/<project>/context.md` или `projects/<project>/decisions.md`. Не превращайте task в постоянный source of truth.
