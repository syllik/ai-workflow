# План correction 4: генерация project index

## Проблема

`projects/index.md` объявлен производным от `workspace.yaml`. Проверка обнаруживает
его рассинхронизацию, но `plan/apply` не создаёт операцию обновления. После
добавления нового проекта автоматический процесс не может прийти к состоянию без
drift.

## Решение

1. Добавить строго ограниченную операцию записи generated-файла только для
   центрального `projects/index.md`.
2. Планировать её из `renderProjectIndex(manifest)` только после проверки, что
   manifest находится в ожидаемом checkout `syllik/ai-workflow` внутри canonical
   workspace root.
3. До записи повторно проверить real-path containment, чистоту repository,
   исходный fingerprint, точный путь и точное renderer-содержимое.
4. Включить результат записи в уже существующий same-process fingerprint
   механизм, чтобы один `apply` завершался без ложного `DIRTY_REPOSITORY`.
5. Не давать операции возможности перезаписывать другие файлы и не менять
   `workspace.yaml`, список проектов или target repositories вне обычного
   существующего поведения.

## Проверка

- Новый валидный manifest record + устаревший index → `apply` обновляет index,
  создаёт допустимый target и завершается без drift.
- Повторный `plan` не содержит операций; `check` проходит.
- Подмена пути/содержимого, изменение index после plan, неправильный manifest
  checkout, dirty repository и symlink escape блокируются до записи.
- Read-only backend остаётся полностью без изменений.
- `npm test`, `npm run verify` и `git diff --check` проходят.

## Ограничения

- Работа только в `syllik/ai-workflow`, в существующей ветке и PR #4.
- Реальный `apply` для `/Users/mihaildovgun/Desktop/WORK` не запускать.
- Merge, auto-merge, force-push и прямой push в `master` запрещены.
- Luna не читает этот файл; исполняемый контракт находится в `prompt.md`.
