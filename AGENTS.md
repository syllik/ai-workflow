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

Не используйте `AGENTS.md` как единственный bootstrap для ChatGPT Web: для Web
нужна отдельная Project Instructions из README. Не читайте все projects,
prompts, tasks или history без необходимости.

## Основные правила

- GPT-5.6 Sol — planner, architect и research agent; он выпускает один self-contained execution prompt.
- Luna xhigh — executor, coder и reviewer; она читает target repository instructions, реализует, проверяет и смотрит diff.
- Lightweight task — default: task files не обязательны.
- Persisted task создаётся только для большой, архитектурной, длительной, межсессионной или audit-значимой работы; default structure: `plan.md`, `prompt.md`, `result.md`.
- Task `context.md` optional и не должен дублировать `plan.md`.
- Если существует утверждённый `plan.md`, не меняйте архитектуру без явной причины.
- Не используйте subagents, не повторяйте broad research и не расширяйте scope.
- Не создавайте лишнюю документацию и unrelated refactoring.
- Обновляйте canonical project context только при появлении устойчивого знания.
- Никогда не сохраняйте secrets, credentials, tokens, private keys или содержимое `.env`.
- Пользовательские объяснения и документацию пишите на русском; technical identifiers оставляйте на английском, если это естественно.
