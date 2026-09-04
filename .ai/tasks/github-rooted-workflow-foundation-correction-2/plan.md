# Коррекция 2 GitHub-rooted workflow foundation

**Статус:** утверждено пользователем  
**Дата:** 2026-09-03  
**Repository:** `syllik/ai-workflow`  
**Branch:** `task/github-rooted-agent-architecture`  
**PR:** #4  
**Исходный head:** `656d3d4cefddef771c2aa205c878009b5fd8eff0`

## Цель

Устранить пять оставшихся блокеров Phase 1A, чтобы canonical `check/apply` действительно работал, target repositories получали корректную GitHub-маршрутизацию, а заполненный project context оставался долговечной памятью проекта.

## Исправления

1. **Project context.** Если `.ai/context.md` отсутствует — создать scaffold. Если существует — не перезаписывать, не сравнивать с пустым шаблоном и не блокировать из-за заполненного содержания. Проверять тип файла и лимит 8 KB. Удалить тест, закрепляющий `POPULATED_CONTEXT`.
2. **GitHub routing.** Сгенерированный target `AGENTS.md` должен использовать абсолютные ссылки на `syllik/ai-workflow/FLOW.md`, manifest, index и role files. Локальными остаются только target `AGENTS.md`, `.ai/context.md`, decisions и task files. Profile renderer также использует абсолютный canonical route.
3. **Однопроходный apply.** Для отсутствующего managed repository одна команда `workspace apply` должна безопасно выполнить clone, проверить repository и создать contract. Успех разрешён только после финального плана без pending operations. Read-only repository после clone остаётся без writes.
4. **Адресная проверка budgets.** Не обходить и не читать весь `~/Desktop/WORK`. Проверять только известные artifacts: central `AI.md`, `FLOW.md`, `global/*`, task Markdown рядом с manifest и соответствующие `AGENTS.md`/`.ai` файлы managed repositories. Включить human `plan.md` в проверку 16 KB.
5. **Human-only plan.** Удалить из README и agent rules указание Luna читать `plan.md`. Luna исполняет только English `prompt.md` и использует `state.md` для resume; русский plan остаётся только для пользователя.

## Выполнение

- Для каждой проблемы сначала написать failing test, затем минимальное исправление.
- Не менять dependencies, manifest project list или утверждённую архитектуру.
- Не запускать настоящий apply против `/Users/mihaildovgun/Desktop/WORK`.
- Не изменять другие repositories; backend остаётся строго read-only.
- Использовать ту же ветку и PR №4.
- Обновить предыдущий correction state/result как superseded.
- Выполнить focused tests, `npm test`, `npm run verify`, `git diff --check` и полный diff review.
- Не использовать subagents, reset, rebase, stash, force-push, merge или auto-merge.

## Критерии готовности

- заполненный context не вызывает drift/block и сохраняется неизменным;
- target routing работает напрямую из любого managed repository;
- один apply приводит отсутствующий managed repo к полностью созданному contract;
- read-only clone не порождает writes;
- validator не читает unrelated workspace files и проверяет все утверждённые Markdown budgets;
- Luna нигде не обязана читать русский plan;
- PR №4 заканчивается в `READY_FOR_HUMAN_MERGE` для повторного Sol-review.
