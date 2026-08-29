# gpg-signed-commits

## Repository

[`syllik/gpg-signed-commits`](https://github.com/syllik/gpg-signed-commits)

## Purpose

Проект, связанный с настройкой и использованием GPG-signed Git commits.

## Current state

Source of truth — актуальный default branch target repository. Этот context не
содержит копию README, кода, ключей или credentials.

## Architecture and conventions

Актуальные conventions и supported workflow определяются по target repository
для конкретной задачи. Не фиксируйте догадки как project context.

## Workflow constraints

- Никогда не сохранять private keys, passphrases, tokens, credentials или `.env`.
- Перед изменениями читать target `AGENTS.md` и другие repository-local instructions.
- Проверять инструкции по signing и verification непосредственно в target repository.

## Canonical files in target repository

- `AGENTS.md` и другие local instructions — правила работы, если они существуют.
- `README.md` — setup и usage, если файл существует.
- Текущие scripts, configuration и tests — источник фактического состояния.
