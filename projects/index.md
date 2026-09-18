# Workspace project index

Generated from `workspace.yaml`. Lifecycle and branch state are explicit; `migration` marks managed repositories that have not yet reached the canonical `master` model. Context dependencies are explicit read-only sources.

| Repository | Group | Access | Status | Lifecycle | Branch state | Integration branch | Release branch | GitHub source | Context dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ChipIn-one/.github | products/chipin | managed | active | code-only | migration | main | — | [.ai/context.md](https://github.com/ChipIn-one/.github/blob/main/.ai/context.md) | — |
| ChipIn-one/chipin-backend | products/chipin | read-only | active | production | external | develop | — | [repository source of truth](https://github.com/ChipIn-one/chipin-backend/tree/develop) | [ChipIn-one/chipin-knowledge-base](https://github.com/ChipIn-one/chipin-knowledge-base/tree/main) |
| ChipIn-one/chipin-frontend | products/chipin | managed | active | production | migration | dev | main | [.ai/context.md](https://github.com/ChipIn-one/chipin-frontend/blob/dev/.ai/context.md) | [ChipIn-one/chipin-knowledge-base](https://github.com/ChipIn-one/chipin-knowledge-base/tree/main) |
| ChipIn-one/chipin-knowledge-base | products/chipin | read-only | active | code-only | external | main | — | [repository source of truth](https://github.com/ChipIn-one/chipin-knowledge-base/tree/main) | — |
| syllik/ai-workflow | workflows/ai | managed | active | code-only | canonical | master | — | [.ai/context.md](https://github.com/syllik/ai-workflow/blob/master/.ai/context.md) | — |
| syllik/chatgpt-archive-cleanup | tools/ai | managed | active | code-only | migration | main | — | [.ai/context.md](https://github.com/syllik/chatgpt-archive-cleanup/blob/main/.ai/context.md) | — |
| syllik/codex-local-runner | tools/ai | managed | onboarding | code-only | canonical | master | — | [onboarding source](https://github.com/syllik/codex-local-runner/tree/master) | — |
| syllik/gpg-signed-commits | guides/git | managed | active | code-only | migration | main | — | [.ai/context.md](https://github.com/syllik/gpg-signed-commits/blob/main/.ai/context.md) | — |
| syllik/syllik | profile | managed | active | code-only | canonical | master | — | [.ai/context.md](https://github.com/syllik/syllik/blob/master/.ai/context.md) | — |
| syllik/youtube-metadata-translator | tools/content | managed | active | code-only | migration | main | — | [.ai/context.md](https://github.com/syllik/youtube-metadata-translator/blob/main/.ai/context.md) | — |
