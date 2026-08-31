# Workflow

## Основной процесс

`FLOW.md` — короткий bootstrap. Полный рабочий путь:

```text
User task → Sol plan/prompt → Luna reads necessary context → implementation
→ targeted validation → bounded diff review → short cross-file integration review
→ full local completion gate → stage task-owned files → commit
→ pre-push repeats the local gate → push task branch
→ open/update PR into integration branch
→ wait/check required remote CI → if green: READY FOR HUMAN MERGE
→ human merges integration branch.
```

Порядок контекста: global workflow → project context / decisions → target
`AGENTS.md` и релевантные rules → task-specific prompt.

## Роли

Sol — planner, architect и research agent. Он выдаёт self-contained prompt.
Luna — executor, coder и reviewer: реализует scope, валидирует, исправляет,
делает bounded self-review, commit, push task branch и PR только при
разрешении. Luna never merges integration branches and never pushes directly to
`dev`/`main`; human performs the merge.

Subagents запрещены. Luna не повторяет broad research Sol, не перечитывает весь
storage, не перепроектирует задачу и не делает unrelated refactoring.

Обычный lifecycle не требует user-controlled staging, staged review checkpoint,
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

## Persisted tasks

Обычные задачи не требуют task files. `projects/<project>/tasks/<task>/`
создаётся только для большой, архитектурной, длительной или audit-значимой
работы. Устойчивые решения после завершения переносятся в project context или
decisions; credentials и secrets не сохраняются.
