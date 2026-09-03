# Коррекция GitHub-rooted workflow foundation

**Статус:** утверждено пользователем  
**Дата:** 2026-09-03  
**Repository:** `syllik/ai-workflow`  
**Branch:** `task/github-rooted-agent-architecture`  
**PR:** #4  
**Исходный implementation head:** `06b293d9e1de1697c07efec6fd5dc0907c1d025b`

## Цель

Исправить семь архитектурных расхождений Phase 1A, не расширяя scope и не меняя утверждённый дизайн. Работа выполняется Luna xhigh в той же ветке и PR. Merge остаётся ручным.

## Что исправить

1. Убрать из validator жёстко прошитый список восьми repositories. Единственный allowlist — записи `workspace.yaml`; добавление repository остаётся пользовательским governance-решением, а не константой в коде.
2. Убрать постоянный запрет `workspace apply` для `~/Desktop/WORK`. Во время этой задачи реальный apply не запускать, но продукт обязан его поддерживать.
3. Разделить путь manifest и workspace root: manifest берётся из checkout `ai-workflow` либо явного `--manifest`; `--root` означает только корень workspace.
4. Планировать `AGENTS.md` и `.ai` contract внутри каждого `managed` target repository, а не в корне workspace.
5. Разрешить clone отсутствующего allowlisted `read-only` repository для чтения, но запретить любые scaffold/update/write операции внутри него.
6. Генерировать GitHub-ссылки, пригодные для навигации из GitHub. Для managed repository вести на его `.ai/context.md`; для `ChipIn-one/chipin-backend` — только на repository, без несуществующего context.
7. Сделать agent-facing routing английским, убрать требование отдельных ChatGPT Project Instructions и исправить ложную семантику state: immutable handoff и текущий PR head — разные значения.

## Порядок

- Сначала добавить failing tests для каждого расхождения.
- Затем внести минимальные изменения в `scripts/workspace/*.mjs`, templates/generated Markdown и task state.
- Не делать unrelated refactor и не менять dependencies.
- Обновить generated outputs только через штатный deterministic flow.
- Выполнить focused tests, `npm test`, `npm run verify` и полный diff review.
- Обновить существующий PR #4; новый PR не создавать.
- Не запускать apply против `/Users/mihaildovgun/Desktop/WORK`.
- Не менять другие repositories, особенно `ChipIn-one/chipin-backend`.
- Не использовать subagents, force-push, merge или auto-merge.

## Проверка результата

Тесты должны доказывать:

- произвольная новая безопасная manifest entry принимается без изменения исходников;
- canonical workspace root не запрещён движком;
- `--root` не меняет расположение manifest;
- routing/scaffold адресуется каждому managed repository;
- read-only repository можно clone, но нельзя изменять;
- index использует GitHub URLs и не создаёт backend context link;
- agent-facing instructions английские и GitHub является достаточной точкой входа;
- state различает исходный immutable handoff и изменяющийся PR head.

После публикации Luna останавливается на `READY_FOR_HUMAN_MERGE`; перед merge Sol повторно проверяет PR.
