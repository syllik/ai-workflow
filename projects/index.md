# Workspace project index

Generated from `workspace.yaml`. Active managed projects route to context on their integration branch; onboarding records route only to repository source. Context dependencies are explicit read-only sources.

| Repository | Group | Access | Status | Integration branch | GitHub source | Context dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| ChipIn-one/.github | products/chipin | managed | active | main | [.ai/context.md](https://github.com/ChipIn-one/.github/blob/main/.ai/context.md) | — |
| ChipIn-one/chipin-backend | products/chipin | read-only | active | develop | [repository source of truth](https://github.com/ChipIn-one/chipin-backend/tree/develop) | [ChipIn-one/chipin-knowledge-base](https://github.com/ChipIn-one/chipin-knowledge-base/tree/main) |
| ChipIn-one/chipin-frontend | products/chipin | managed | active | dev | [.ai/context.md](https://github.com/ChipIn-one/chipin-frontend/blob/dev/.ai/context.md) | [ChipIn-one/chipin-knowledge-base](https://github.com/ChipIn-one/chipin-knowledge-base/tree/main) |
| ChipIn-one/chipin-knowledge-base | products/chipin | read-only | active | main | [repository source of truth](https://github.com/ChipIn-one/chipin-knowledge-base/tree/main) | — |
| syllik/ai-workflow | workflows/ai | managed | active | master | [.ai/context.md](https://github.com/syllik/ai-workflow/blob/master/.ai/context.md) | — |
| syllik/chatgpt-archive-cleanup | tools/ai | managed | active | main | [.ai/context.md](https://github.com/syllik/chatgpt-archive-cleanup/blob/main/.ai/context.md) | — |
| syllik/codex-local-runner | tools/ai | managed | onboarding | master | [onboarding source](https://github.com/syllik/codex-local-runner/tree/master) | — |
| syllik/gpg-signed-commits | guides/git | managed | active | main | [.ai/context.md](https://github.com/syllik/gpg-signed-commits/blob/main/.ai/context.md) | — |
| syllik/life-ops | personal | managed | active | master | [.ai/context.md](https://github.com/syllik/life-ops/blob/master/.ai/context.md) | — |
| syllik/life-ops-bot | personal | managed | active | master | [.ai/context.md](https://github.com/syllik/life-ops-bot/blob/master/.ai/context.md) | [syllik/life-ops](https://github.com/syllik/life-ops/tree/master) |
| syllik/syllik | profile | managed | active | master | [.ai/context.md](https://github.com/syllik/syllik/blob/master/.ai/context.md) | — |
| syllik/youtube-metadata-translator | tools/content | managed | active | main | [.ai/context.md](https://github.com/syllik/youtube-metadata-translator/blob/main/.ai/context.md) | — |

## Audited Git lifecycle

Canonical source branch: `master`. Normal PR merge: `squash`. Production promotion: `exact-commit`.

Only repositories listed below were audited for this policy task. Other workspace records remain unverified for Git lifecycle state.

| Repository | Deployment profile | Branch state | Default branch | Integration branch | Promotion branch | Exception / follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| ChipIn-one/.github | none | migration | main | main | — | — |
| ChipIn-one/chipin-backend | production | migration | develop | develop | — | — |
| ChipIn-one/chipin-frontend | production | temporary-exception | main | dev | main | Preserve the enforced dev-to-main ancestry promotion until exact-commit promotion replaces it. Follow-up: Replace dev-to-main promotion, then migrate the canonical long-lived source to master. |
| ChipIn-one/chipin-knowledge-base | none | migration | main | main | — | — |
| syllik/ai-workflow | none | canonical | master | master | — | — |
| syllik/syllik | none | canonical | master | master | — | — |
