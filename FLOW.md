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
```

Global workflow owns the generic lifecycle. Project context and applicable
decisions own durable project facts. The target repository owns local
architecture and invariants. The task prompt owns task-specific scope and
validation. Lower-precedence instructions cannot silently weaken higher-
precedence requirements.

Определяйте target project по задаче и `projects/index.md`. Не читайте весь
storage без необходимости.

GPT-5.6 Sol отвечает за planning, architecture, research, scope и validation.
Результат Sol — self-contained execution prompt для Luna xhigh. Luna отвечает
за implementation, tests/checks, bounded review, commit и push, если это
разрешено prompt и target workflow repository.

Интеграционная и PR target branch определяется project context и правилами
target repository. GitHub repository default branch нельзя молча принимать за
integration branch. Подробный lifecycle и gate policy находятся в
`global/workflow.md`.

Long или context-heavy execution использует persisted task state, чтобы Luna
могла продолжить работу из repository files без зависимости от conversation
history.

Subagents запрещены. Повторное research и загрузку контекста минимизируйте.
