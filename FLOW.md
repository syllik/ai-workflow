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
за implementation, tests/checks, bounded self-review, commit, push task branch
и PR, если это разрешено prompt и target workflow repository.

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

Luna never merges integration branches and never pushes directly to `dev` или
`main`. Human performs the merge after the authoritative remote gate is green.

Subagents запрещены. Повторное research и загрузку контекста минимизируйте.
