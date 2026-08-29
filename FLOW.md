# Canonical workflow

Этот repository — canonical storage для workflow и устойчивого AI-контекста.
Используйте только нужные файлы: текущее состояние кода всегда проверяется в
target GitHub repository.

## Порядок чтения

```text
FLOW.md
↓
global/context.md
↓
global/workflow.md
↓
projects/index.md
↓
projects/<project>/context.md
↓
projects/<project>/decisions.md  # только если решение относится к задаче
↓
актуальный target GitHub repository
```

Сначала определите target project по задаче и `projects/index.md`. Не читайте
все `projects/`, `prompts/`, `tasks/` или history без необходимости. Если
repository нельзя определить однозначно, запросите только недостающую
информацию.

GPT-5.6 Sol отвечает за planning, architecture, research, scope и validation.
Результат Sol — один self-contained execution prompt для Luna xhigh. Luna
отвечает за implementation, tests/checks, review diff, commit и push, если это
разрешено её prompt и workflow target repository.

Обычные задачи не требуют сохранения task files. Создавайте persisted task
только для большой, архитектурной, длительной или audit-значимой работы.
Subagents запрещены. Повторное research и загрузку контекста минимизируйте.
