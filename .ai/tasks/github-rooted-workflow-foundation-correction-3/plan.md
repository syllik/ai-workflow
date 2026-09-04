# Коррекция 3 GitHub-rooted workflow foundation

**Статус:** утверждено пользователем  
**Дата:** 2026-09-04  
**Repository:** `syllik/ai-workflow`  
**Branch:** `task/github-rooted-agent-architecture`  
**PR:** #4  
**Исходный head:** `fcbe029223b0e77d60b1c92918ff99c4170b0958`

## Цель

Закрыть пять оставшихся проблем безопасности и контракта Phase 1A без расширения архитектуры.

## Исправления

1. **Чистое рабочее дерево.** Начальный `plan/apply` блокируется при любых tracked или untracked изменениях, включая `AGENTS.md`, `.ai/context.md` и `.ai/decisions.md`. Временно разрешать можно только файлы, созданные текущим apply-процессом, с точными путями и fingerprint; пользовательские файлы нельзя принимать за generated.
2. **Symlink containment.** Запретить symlink в любом сегменте пути между workspace root и repository/artifact. Для существующих и отсутствующих targets проверять real path ближайшего существующего ancestor. Повторять проверку непосредственно перед clone/create/replace. Ни чтение, ни запись не должны выходить за root.
3. **Generated drift.** Перегенерировать routing block в текущем `AGENTS.md` с абсолютными GitHub URLs. `npm run verify`, запущенный из checkout `ai-workflow`, должен обнаруживать stale или отсутствующий central managed block, даже когда canonical workspace root не передан.
4. **English agent contract.** Удалить оставшуюся рекомендацию Luna использовать `approved plan`. Перевести reusable agent prompts/templates в `prompts/` и `templates/` на английский. Русский разрешён только в human `plan.md` и пользовательском README; Luna никогда не читает plan.
5. **Context budget invariant.** Для managed repository разрешён только `contextPath: .ai/context.md`. Любой другой путь отклоняется manifest validation, поэтому лимит 8 KB нельзя обойти.

## Проверки

- untracked contract-файл до запуска даёт `DIRTY_REPOSITORY`, ноль операций и не изменяется;
- generated artifacts текущего apply разрешаются только по exact path/hash, после чего однопроходный apply по-прежнему сходится;
- intermediate symlink наружу блокирует clone и file operations, а outside directory остаётся без изменений;
- checked-in `AGENTS.md` совпадает с renderer, а намеренный stale block ломает `workspace check`;
- executable prompts/templates не содержат кириллицу и положительные инструкции читать human plan;
- custom managed context path невалиден; стандартный oversized context даёт `BUDGET_EXCEEDED`;
- прежние 41 тест и новые regression tests проходят.

## Ограничения

- Не менять dependencies, project list или утверждённую архитектуру.
- Не запускать настоящий apply против `/Users/mihaildovgun/Desktop/WORK`.
- Не изменять другие repositories; backend строго read-only.
- Использовать ту же ветку и PR №4.
- Correction 2 state/result пометить superseded.
- Не использовать subagents, reset, rebase, stash, force-push, merge или auto-merge.
- После focused tests выполнить `npm test`, `npm run verify`, `git diff --check` и полный diff review.

После публикации Luna останавливается на `READY_FOR_HUMAN_MERGE` для нового Sol-review.
