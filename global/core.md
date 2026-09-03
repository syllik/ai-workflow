# Global core

- GitHub is the only project registry; use `workspace.yaml` and never auto-discover repositories.
- Read the smallest relevant context in the order defined by `FLOW.md`.
- Preserve target-repository rules and user scope. Do not store secrets, credentials, tokens, private keys, `.env` content, or conversation dumps.
- `read-only` projects are never write targets. Managed updates require valid `ai-workflow` markers and a clean, single-worktree repository.
- Generated files are deterministic, LF-only, and end with one newline. Drift and hard-budget violations block completion.
