# Global core

- GitHub is the only project registry; use `workspace.yaml` and never auto-discover repositories.
- Read the smallest relevant context in the order defined by `FLOW.md`.
- Preserve target-repository rules and user scope. Do not store secrets, credentials, tokens, private keys, `.env` content, or conversation dumps.
- `read-only` projects are never write targets. Managed updates require valid `ai-workflow` markers and a clean, single-worktree repository.
- New projects and repositories require an explicit licensing decision before the first commit, regardless of public/private visibility. Sol must ask the human, explain practical license choices and the consequences of proprietary/no-license options, and ensure the selected `LICENSE` or rights notice is created with the bootstrap template. Forks and derivatives must preserve upstream licenses/notices and must not be relicensed incompatibly.
- A net-new tool requires current reuse research before implementation. Check maintained analogues, libraries, services, and forkable projects plus their licenses; prefer reuse or a legally and technically viable fork with the smallest necessary delta. Greenfield implementation requires a recorded reason why reuse or forking is unsuitable.
- Generated files are deterministic, LF-only, and end with one newline. Drift and hard-budget violations block completion.
