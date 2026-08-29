# Youtube-video-meta-translator

## Repository

[`syllik/Youtube-video-meta-translator`](https://github.com/syllik/Youtube-video-meta-translator)

## Purpose

Инструменты для подготовки, проверки и публикации YouTube video metadata и
localizations.

## Current state

Source of truth — актуальный default branch target repository. Этот context не
является копией его README, кода или текущего Git diff.

## Architecture and conventions

Устойчивые conventions и границы компонентов фиксируются только после проверки
target repository. Для конкретной задачи сначала читайте его `AGENTS.md` и
другие repository-local instructions, если они существуют.

## Workflow constraints

- Не сохранять credentials, tokens, private keys или содержимое `.env`.
- Не расширять scope и не дублировать обязанности других систем без решения Sol.
- Проверять актуальные tests, validation и publish constraints в target repository.

## Canonical files in target repository

- `AGENTS.md` и другие local instructions — правила работы.
- `README.md` — пользовательское описание и entry points, если файл существует.
- Текущий код, tests и configuration — источник фактического состояния.
