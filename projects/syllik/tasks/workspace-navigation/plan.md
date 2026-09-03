# Workspace navigation Implementation Plan

**Goal:** Организовать approved independent repositories в purpose-first структуру `~/Desktop/Work`, переименовать ровно два GitHub repositories и создать canonical profile/workflow navigation.

**Architecture:** Каждый leaf directory остаётся самостоятельным Git repository со своим `.git`, history, branches, remotes, visibility и workflow. Profile repository `syllik/syllik` является навигационной точкой; `syllik/ai-workflow` хранит canonical workflow и persisted task state. Monorepo и Git submodules не создаются.

**Tech Stack:** Local filesystem, Git, authenticated GitHub CLI `gh`, Markdown documentation.

**Spec:** `projects/syllik/tasks/workspace-navigation/prompt.md`

## Global Constraints

- Canonical local root: `~/Desktop/Work`.
- Approved purpose-first structure и repository mapping копируются из task prompt.
- Разрешены ровно два GitHub rename; visibility, default branches и прочие settings не изменяются.
- Запрещены direct push в protected/integration branches, merge, auto-merge, force push, delete branch и destructive cleanup.
- `slack-rofls` и остальные excluded repositories не трогаются и не документируются.
- Documentation language: новая profile/workspace documentation — English; итоговый отчёт — Russian.
- Recovery refs остаются local-only и не push’нуты.

---

## Approved architecture

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

| Target local path | Canonical GitHub repository | Visibility |
| --- | --- | --- |
| `profile/syllik` | `syllik/syllik` | Public |
| `products/chipin/chipin-frontend` | `ChipIn-one/chipin-frontend` | Public |
| `products/chipin/chipin-backend` | `ChipIn-one/chipin-backend` | Private |
| `tools/ai/chatgpt-archive-cleanup` | `syllik/chatgpt-archive-cleanup` | Public |
| `tools/ai/codex-local-runner` | `syllik/codex-local-runner` | Private |
| `tools/content/youtube-metadata-translator` | `syllik/youtube-metadata-translator` | Public |
| `workflows/ai/ai-workflow` | `syllik/ai-workflow` | Public |
| `guides/git/gpg-signed-commits` | `syllik/gpg-signed-commits` | Public |

## Approved GitHub renames

- `syllik/Youtube-video-meta-translator` → `syllik/youtube-metadata-translator`.
- `syllik/my-prompt-storage` → `syllik/ai-workflow`.

Preserve each repository's existing transport, visibility, default branch,
license, topics, description and other settings. Update local `origin` only
after the corresponding rename is confirmed.

## Documentation structure

`syllik/syllik` receives `README.md`, `docs/README.md`, `docs/workspace.md`,
`docs/repositories.md` and `docs/conventions.md`. The README remains the
profile entry point and links to all eight approved repositories, marking
private repositories with `🔒 Private`.

`ai-workflow` receives canonical reference updates, the renamed YouTube project
context directory, and persisted task files under this directory. Historical
rename wording remains only where needed in this task's `plan.md` and
`prompt.md`.

## Exclusions and publication policy

The excluded repositories and organization-owned `slack-rofls` are not moved,
edited, renamed, archived or documented. Only authorized task branches may be
committed and pushed. PRs target `master` for `ai-workflow` and `syllik/syllik`,
and `main` for `youtube-metadata-translator`; human merge remains required.
