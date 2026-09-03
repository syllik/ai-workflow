# Luna execution prompt: workspace structure and GitHub navigation

Ты — Luna xhigh, единственный executor, coder и reviewer этой задачи.

Работай локально на MacBook пользователя. Не используй subagents, ChatGPT Work, браузерную автоматизацию или web research. Используй только локальную файловую систему, Git и авторизованный GitHub CLI `gh`.

## Task

Организовать независимые Git-репозитории пользователя в purpose-first структуру внутри `~/Desktop/Work`, переименовать два репозитория, создать единую Markdown-навигацию в профильном `syllik/syllik` и синхронизировать canonical AI workflow documentation.

Код разных проектов не объединять. Monorepo и Git submodules не создавать.

## Canonical workflow

До любых изменений найди текущий локальный checkout `syllik/my-prompt-storage` и прочитай строго необходимый контекст в следующем порядке:

1. `FLOW.md`
2. `global/context.md`
3. `global/workflow.md`
4. `projects/index.md`
5. `AGENTS.md`
6. `prompts/implementation.md`
7. релевантные project contexts:

   * `projects/youtube-video-meta-translator/context.md`
   * `projects/gpg-signed-commits/context.md`
   * `projects/chipin/context.md`
   * `projects/chipin/decisions.md`
8. target-repository `AGENTS.md` и локальные rules только в репозиториях, где будут изменяться tracked files.

Не читай unrelated project history и не повторяй архитектурное исследование Sol.

## Approved architecture

Canonical local root:

```text
~/Desktop/Work/
```

Утверждённая purpose-first структура:

```text
~/Desktop/Work/
├── profile/
│   └── syllik/
├── products/
│   └── chipin/
│       ├── chipin-frontend/
│       └── chipin-backend/
├── tools/
│   ├── ai/
│   │   ├── chatgpt-archive-cleanup/
│   │   └── codex-local-runner/
│   └── content/
│       └── youtube-metadata-translator/
├── workflows/
│   └── ai/
│       └── ai-workflow/
└── guides/
    └── git/
        └── gpg-signed-commits/
```

Каждый leaf directory остаётся самостоятельным Git repository со своим `.git`, историей, branches, remotes, visibility и workflow.

## Repository mapping

| Target local path                           | Canonical GitHub repository          | Visibility |
| ------------------------------------------- | ------------------------------------ | ---------- |
| `profile/syllik`                            | `syllik/syllik`                      | Public     |
| `products/chipin/chipin-frontend`           | `ChipIn-one/chipin-frontend`         | Public     |
| `products/chipin/chipin-backend`            | `ChipIn-one/chipin-backend`          | Private    |
| `tools/ai/chatgpt-archive-cleanup`          | `syllik/chatgpt-archive-cleanup`     | Public     |
| `tools/ai/codex-local-runner`               | `syllik/codex-local-runner`          | Private    |
| `tools/content/youtube-metadata-translator` | `syllik/youtube-metadata-translator` | Public     |
| `workflows/ai/ai-workflow`                  | `syllik/ai-workflow`                 | Public     |
| `guides/git/gpg-signed-commits`             | `syllik/gpg-signed-commits`          | Public     |

## Repository renames

Разрешены ровно два GitHub rename:

```text
syllik/Youtube-video-meta-translator
→ syllik/youtube-metadata-translator

syllik/my-prompt-storage
→ syllik/ai-workflow
```

Перед rename проверь через `gh repo view`, что новые имена ещё не заняты. После rename проверь canonical URL, visibility и default branch.

Обнови `origin` соответствующих локальных checkout. Сохрани текущий transport:

* SSH remote должен остаться SSH;
* HTTPS remote должен остаться HTTPS.

Старые GitHub redirects не считать canonical URLs.

Не менять visibility, default branches, licenses, topics, repository descriptions или другие GitHub settings.

## Repositories excluded from the task

Полностью исключены:

```text
syllik/tangem-app-android
syllik/tangem-app-android-new
syllik/syllik.github.io
```

Не перемещай их локальные checkout, не редактируй, не переименовывай, не архивируй и не упоминай в новой профильной навигации или workspace documentation.

## Expected remote baselines

Planning snapshot:

```text
syllik/syllik
branch: master
SHA: 63d7ccd86b8c589e3168c9e6b118c1f4bb6f38d0

syllik/my-prompt-storage
branch: master
SHA: 20a035b893c23db3466e2457f391e631ccfa7d30

syllik/Youtube-video-meta-translator
branch: main
SHA: ac5517e556c8304a3b82516719e6669dcb209c52
```

Сначала выполни `git fetch --prune`. Фактический current remote SHA после fetch является источником истины.

Если SHA изменился, проверь только новый commit range на конфликт с задачей. Если изменения затрагивают workflow rules, структуру или редактируемые документы, остановись и сообщи пользователю. Если advancement не конфликтует, запиши фактический base SHA в persisted task state и продолжай.

## Persistence mode

Mode: `persisted`.

Canonical task directory после rename:

```text
~/Desktop/Work/workflows/ai/ai-workflow/projects/syllik/tasks/workspace-navigation/
```

До первой GitHub rename или локального перемещения создай task branch `task/workspace-navigation` в текущем checkout `my-prompt-storage` от актуального `origin/master`.

Создай:

```text
projects/syllik/tasks/workspace-navigation/
├── plan.md
├── prompt.md
├── state.md
└── result.md
```

Также создай durable project context:

```text
projects/syllik/context.md
```

Содержание:

* `plan.md` — утверждённая purpose-first архитектура, repository mapping, renames, documentation structure, exclusions и publication policy из этого prompt;
* `prompt.md` — полная сохранённая копия этого execution prompt;
* `state.md` — только короткие секции `Phase`, `Completed`, `Changed or reviewed files`, `Validation`, `Confirmed findings`, `Next`, `Blockers`;
* `result.md` — финальный outcome по структуре существующего `templates/result.md`;
* `projects/syllik/context.md` — назначение `syllik/syllik` как profile repository и canonical entry point для workspace navigation.

Не сохраняй reasoning dumps, raw logs, полный diff или secrets.

После создания initial persisted state сделай отдельный checkpoint commit и push task branch, чтобы состояние пережило interruption. Не открывай PR до завершения содержательных изменений.

Обновляй `state.md` только после meaningful boundaries:

1. завершён read-only audit;
2. выполнены GitHub renames;
3. завершено локальное перемещение;
4. обновлена canonical documentation;
5. завершён review и validation;
6. перед финальными commits/PR.

## Phase 1: read-only audit

Сначала перейди в стабильную директорию:

```bash
cd ~/Desktop/Work
```

Не оставайся текущим shell working directory внутри каталога, который будет перемещён.

Найди Git repositories только внутри `~/Desktop/Work`. Для каждого найденного checkout установи:

* абсолютный путь;
* `origin`;
* текущий branch;
* upstream;
* `git status --porcelain=v1`;
* `git worktree list --porcelain`;
* наличие незакоммиченных или untracked files;
* соответствие одному из approved repositories.

Сопоставляй repositories по normalized `origin`, а не по имени локальной папки.

До изменений проверь:

```bash
gh auth status
gh repo view syllik/codex-local-runner
gh repo view ChipIn-one/chipin-backend
```

Остановись до любых mutations, если обнаружено хотя бы одно из следующего:

* tracked или untracked user work;
* merge, rebase, cherry-pick или bisect in progress;
* больше одного linked worktree;
* duplicate checkouts одного repository;
* неизвестный Git remote;
* конфликтующий non-empty target directory;
* target repository недоступен;
* target rename уже занят другим repository;
* для продолжения требуется delete, overwrite, reset, clean или stash.

Ничего не удаляй и не исправляй предположениями. Верни пользователю точную таблицу blocker → repository → path → required decision.

Если approved repository отсутствует локально, это не blocker: после audit его можно клонировать сразу в canonical target path.

## Phase 2: initialize persisted task

В чистом `my-prompt-storage`:

1. создай `task/workspace-navigation` от актуального `origin/master`;
2. создай persisted task files и `projects/syllik/context.md`;
3. обнови `projects/index.md`, добавив mapping для `syllik/syllik`;
4. сделай checkpoint commit:

```text
docs: initialize workspace navigation task
```

5. push только `task/workspace-navigation`.

Не push напрямую в `master`.

## Phase 3: GitHub renames

Выполни только два approved rename через `gh`.

После каждого rename:

1. проверь новый `nameWithOwner`;
2. проверь visibility и default branch;
3. обнови локальный `origin`;
4. выполни `git fetch --prune`;
5. проверь, что task branch и history сохранились;
6. обнови `state.md`.

Если rename частично выполнен, не пытайся откатывать его предположениями. Зафиксируй фактическое состояние и остановись для решения пользователя.

## Phase 4: local workspace migration

Создай только необходимые parent directories внутри `~/Desktop/Work`.

Перемещай существующие clean checkout обычным filesystem move вместе с их `.git`. Не копируй содержимое и не создавай вложенные repositories вручную.

Если approved repository отсутствует, клонируй его через `gh repo clone` непосредственно в canonical target path.

После каждого move/clone проверь:

```text
git rev-parse --show-toplevel
git remote get-url origin
git branch --show-current
git status --short
```

Проверь, что remote соответствует mapping, а checkout остаётся самостоятельным repository.

Не изменяй branches или tracked files в следующих repositories — для них требуется только корректное локальное размещение:

```text
ChipIn-one/chipin-frontend
ChipIn-one/chipin-backend
syllik/chatgpt-archive-cleanup
syllik/codex-local-runner
syllik/gpg-signed-commits
```

## Phase 5: profile documentation

Repository:

```text
~/Desktop/Work/profile/syllik
```

Base branch: актуальный `origin/master`.

Authorized task branch:

```text
task/workspace-navigation
```

PR target:

```text
master
```

Создай или обнови:

```text
README.md
docs/README.md
docs/workspace.md
docs/repositories.md
docs/conventions.md
```

### README.md

Сохрани существующий identity/profile introduction, support и contact information, если они не конфликтуют с новой структурой. Не делай unrelated rewrite.

Сделай `README.md` главной входной точкой. Добавь короткий documentation link и вложенную кликабельную Markdown-навигацию в следующем смысловом порядке:

1. Profile
2. Products

   * ChipIn
3. Tools

   * AI
   * Content
4. Workflows

   * AI
5. Guides

   * Git

Включи все восемь approved repositories. Private repositories показывай с пометкой `🔒 Private`. Это явно утверждено пользователем.

Не используй code block как единственную навигацию: repository links должны быть кликабельными.

Не создавай отдельные entries для Tangem или `syllik.github.io`.

### docs/README.md

Краткий documentation hub со ссылками на:

* `workspace.md`
* `repositories.md`
* `conventions.md`
* возврат в profile `README.md`

### docs/workspace.md

Зафиксируй:

* canonical root `~/Desktop/Work`;
* точное утверждённое дерево;
* правило purpose-first;
* независимость Git histories;
* отсутствие monorepo и submodules;
* соответствие leaf folder имени repository;
* исключённые repositories;
* безопасный способ добавления нового проекта.

### docs/repositories.md

Создай registry всех восьми approved repositories со столбцами:

* Purpose;
* GitHub repository;
* Local path;
* Visibility;
* Default branch;
* GitHub state.

Используй фактические значения после rename. Не выдумывай product lifecycle status. `GitHub state` означает только archived/not archived.

### docs/conventions.md

Зафиксируй:

* lowercase kebab-case для новых repository и leaf directory names;
* purpose-first top-level categories;
* leaf directory совпадает с repository name;
* private repositories отмечаются `🔒 Private`;
* новый проект требует обновления profile navigation, `workspace.md` и repository registry;
* documentation filenames и technical identifiers — English;
* никаких secrets или credentials;
* archive/reference repositories включаются только по явному решению пользователя.

### Documentation language

Прямое решение пользователя для этой задачи переопределяет global language default:

* вся новая profile/workspace documentation пишется на English;
* итоговый отчёт пользователю — на русском;
* emoji используются умеренно и только как смысловые маркеры.

## Phase 6: update `ai-workflow`

После rename canonical repository:

```text
syllik/ai-workflow
```

Продолжай на уже созданной ветке:

```text
task/workspace-navigation
```

PR target:

```text
master
```

Обнови canonical references:

1. Root `README.md` и его repository title/description wording должны соответствовать имени `ai-workflow`.
2. Web bootstrap URL:

   * старый `https://github.com/syllik/my-prompt-storage`
   * заменить на `https://github.com/syllik/ai-workflow`.
3. В `projects/index.md`:

   * заменить старый YouTube repository URL новым;
   * обновить project-context path;
   * добавить `syllik/syllik` → `projects/syllik/context.md`.
4. Переместить context directory:

```text
projects/youtube-video-meta-translator/
→ projects/youtube-metadata-translator/
```

5. Обновить heading и repository URL внутри соответствующего `context.md`.
6. Найти остальные canonical tracked references на два старых repository name/URL и обновить только реальные ссылки или identifiers.
7. Не переписывать historical migration wording внутри текущих persisted `plan.md` и `prompt.md`, где старое имя необходимо для объяснения rename.

Не изменяй глобальную архитектуру workflow и не выполняй unrelated cleanup.

## Phase 7: `youtube-metadata-translator`

После GitHub rename проверь tracked files на canonical self-references к старому repository URL/name.

Если stale references отсутствуют — не создавай branch и не делай commit.

Если они существуют:

* прочитай repository `AGENTS.md`;
* создай `task/workspace-navigation` от актуального `origin/main`;
* обнови только repository name/path/URL references;
* не меняй application behavior, translations или generated content;
* PR target: `main`.

Если затронут только Markdown/path wording, выполни:

```bash
git diff --check
git diff --cached --check
```

Если затронут Python или configuration, дополнительно выполни полный credential-free gate из `docs/development.md`:

```bash
python -m unittest discover -s tests -v
python -m compileall -q streamlit_app.py pages models.py language_catalog.py language_labels.py llm_localization_package.py codex_localization_runner.py codex_localization_generator.py generation_controller.py generate_codex_localizations.py services state ui youtube_account.py localizations.py localization_service.py tests
python -m pip check
```

Не запускай live YouTube, Codex generation или другие credential/quota-consuming smoke tests.

## Review strategy

Раздели review на coherent areas:

1. GitHub rename state и local remotes;
2. local filesystem mapping;
3. profile README и documentation;
4. `ai-workflow` canonical references и persisted task files;
5. YouTube repository references, только если там появился diff.

После review каждого area обнови короткий `state.md`.

Затем сделай cross-file integration pass:

* каждый профильный URL соответствует фактическому repository;
* каждый local path соответствует утверждённому дереву;
* renamed repositories используются под новыми canonical именами;
* private labels корректны;
* docs indexes не содержат broken relative links;
* excluded repositories нигде не добавлены;
* старые canonical names не остались вне migration task history.

Просмотри полный task-owned diff каждого изменённого repository.

## Local completion gates

### Local workspace

Проверь все восемь canonical target directories:

* каталог существует;
* является Git worktree;
* имеет ожидаемый `origin`;
* не вложен внутрь другого repository;
* `git status --short` чист после commit;
* отсутствуют duplicate checkout внутри `~/Desktop/Work`.

### `syllik/syllik`

```bash
git diff --check
git diff --cached --check
```

Также проверь существование всех четырёх файлов в `docs/` и все relative links.

### `syllik/ai-workflow`

```bash
git diff --check
git diff --cached --check
```

Выполни stale-reference search по tracked workspace, исключив текущий persisted migration history. Старые canonical names не должны оставаться в active documentation:

```text
Youtube-video-meta-translator
my-prompt-storage
```

Historical references внутри текущих `projects/syllik/tasks/workspace-navigation/plan.md` и `prompt.md` допустимы только как описание migration source.

### GitHub links

Через `gh repo view` проверь все восемь canonical repositories после rename. Для private repositories проверка выполняется в авторизованной сессии.

## Git publication policy

Разрешены stage, commit, push task branches и open/update PR.

Не разрешены:

* direct push в `master`, `main`, `develop` или `dev`;
* merge;
* auto-merge;
* force push;
* delete branch;
* изменение visibility или default branch.

Используй commits:

```text
ai-workflow:
docs: align workflow repository structure

syllik:
docs: add workspace navigation

youtube-metadata-translator, только если изменён:
docs: update repository references
```

Если initial persisted checkpoint уже создал отдельный commit, сохрани его и добавь финальный содержательный commit.

Открой или обнови PR:

```text
syllik/ai-workflow
task/workspace-navigation → master

syllik/syllik
task/workspace-navigation → master

syllik/youtube-metadata-translator
task/workspace-navigation → main
только если repository имеет tracked diff
```

PR descriptions должны кратко перечислять scope, local validation и явно говорить, что merge остаётся ручным.

Если GitHub показывает required deterministic checks, дождись green. Если required checks отсутствуют, PR + выполненные local gates достаточны для `READY FOR HUMAN MERGE`.

Никогда не merge и не включай auto-merge.

## Bounded failure diagnosis

При падении validation или CI:

1. прочитай stdout/stderr;
2. проверь `git status`, task-owned diff и непосредственно связанный файл;
3. сделай не более одной очевидной task-local correction;
4. повтори конкретную проверку;
5. если проблема остаётся или требует broad research, остановись.

В отчёте укажи failing check, key error, suspected cause, выполненные проверки, attempted correction и причину escalation.

## Safety constraints

Запрещено:

* `rm`, destructive overwrite или удаление repositories;
* `git reset`, `git clean`, `git stash`, discard user changes;
* объединение Git histories;
* создание monorepo;
* создание submodules;
* изменение project code вне точечных canonical reference updates;
* работа вне `~/Desktop/Work`, кроме read-only GitHub CLI authentication;
* сохранение credentials, tokens, private keys или `.env`;
* использование subagents;
* использование ChatGPT Work;
* повторное broad research;
* unrelated refactoring.

## Stop conditions

Остановись и запроси решение пользователя при:

* неизвестной или dirty user work;
* linked worktrees;
* duplicate repository checkout;
* conflicting target directory;
* repository rename collision;
* отсутствующем доступе к private repository;
* material remote-base drift;
* конфликте target instructions;
* необходимости delete/overwrite;
* частично завершённом rename, который нельзя безопасно продолжить по фактическому состоянию.

## Definition of done

Задача завершена только когда:

1. два GitHub repositories имеют новые canonical names;
2. восемь независимых repositories находятся по утверждённым local paths;
3. `.git` history и remotes сохранены;
4. Tangem и `syllik.github.io` не затронуты;
5. `syllik/syllik` содержит утверждённый profile navigation и четыре documentation files;
6. private repositories показаны с `🔒 Private`;
7. `ai-workflow` содержит обновлённые canonical references, project context и persisted task state;
8. stale canonical references устранены вне migration history;
9. полный task-owned diff reviewed;
10. local completion gates пройдены;
11. task-owned changes committed и pushed только в authorized task branches;
12. PRs открыты в объявленные targets;
13. required CI green, если он существует;
14. `result.md` содержит финальный outcome;
15. пользователь получает краткий отчёт на русском:

    * что переименовано;
    * какие каталоги перемещены или клонированы;
    * какие файлы изменены;
    * результаты validation;
    * commit hashes;
    * PR URLs;
    * blockers или remaining issues;
    * явную отметку `READY FOR HUMAN MERGE`, если все gates выполнены.
