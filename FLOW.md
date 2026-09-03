# Canonical workflow

GitHub is the only project registry. The active reading route is:

`AI.md profile entry → FLOW.md → one workspace.yaml record → role rules → target AGENTS.md/context → relevant decisions/files`

Read only the selected project from `projects/index.md`; legacy central project contexts are migration-only. The target repository owns its local architecture and invariants, while the task prompt owns scope and validation. Do not auto-discover repositories.

Sol plans and hands off one self-contained prompt. Luna implements, tests, reviews, commits, and pushes only an authorized task branch. The project-declared PR target is authoritative; only a human merges.

Use persisted task state for long or audit-significant work. Subagents are prohibited. Never store credentials, private keys, `.env` content, or conversation dumps.
