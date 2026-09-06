# Canonical workflow

GitHub is the only project registry. The active reading route is:

`AI.md profile entry → FLOW.md → one workspace.yaml record → role rules → target AGENTS.md/context → relevant decisions/files`

Read only the selected project from `projects/index.md`; legacy central project contexts are migration-only. The target repository owns its local architecture and invariants, while the task prompt owns scope and validation. Do not auto-discover repositories.

For a new project/repository, licensing is a pre-first-commit architecture gate even when the repository is private: Sol asks the human, explains the relevant choices, and bootstraps the selected license or rights notice with the project template. For a net-new tool, current analogue/reuse research is also a planning gate; prefer a legally and technically viable existing project or fork over greenfield implementation, while preserving upstream license obligations.

Repository registration also has a documentation-sync gate. When a project is added to `workspace.yaml`, Sol must create or update a coordinated `syllik/syllik` change covering `docs/workspace.md` and `docs/repositories.md`. The registry change is not ready for human merge until that workspace-documentation change exists and is synchronized with it. The profile `README.md` keeps a stable link to `docs/workspace.md` and does not carry the project list itself. A repository may be intentionally omitted from workspace documentation only by an explicit human decision.

Sol plans and hands off one self-contained prompt. Luna is executor-only: she implements the authorized scope, runs authorized local validation, checkpoints execution state, and stops at `IMPLEMENTATION_COMPLETE` or `BLOCKED`. Luna does not self-review, create subagents, commit, push, open or update PRs, or mutate publication state.

Code review is a separate independent role performed by Sol 5.6 High against the exact pinned base/head diff. Reviewer findings stay separate from Luna execution checkpoints. Findings are not sent back to Luna until a human explicitly authorizes a correction pass; when authorized, send one consolidated findings package. Publication remains under Sol/human control, and only a human merges.

Use persisted task state for long or audit-significant work. Never store credentials, private keys, `.env` content, or conversation dumps.
