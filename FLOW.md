# Canonical workflow

GitHub is the only project registry. The active reading route is:

`AI.md profile entry → FLOW.md → one workspace.yaml record → role rules → target AGENTS.md/context → relevant decisions/files`

Read only the selected project from `projects/index.md`; legacy central project contexts are migration-only. The target repository owns its local architecture and invariants, while the task prompt owns scope and validation. Do not auto-discover repositories.

For a new project/repository, licensing is a pre-first-commit architecture gate even when the repository is private: Sol asks the human, explains the relevant choices, and bootstraps the selected license or rights notice with the project template. For a net-new tool, current analogue/reuse research is also a planning gate; prefer a legally and technically viable existing project or fork over greenfield implementation, while preserving upstream license obligations.

Repository registration also has a documentation-sync gate. When a project is added to `workspace.yaml`, Sol must create or update a coordinated `syllik/syllik` change covering `docs/workspace.md` and `docs/repositories.md`. The registry change is not ready for human merge until that workspace-documentation change exists and is synchronized with it. The profile `README.md` keeps a stable link to `docs/workspace.md` and does not carry the project list itself. A repository may be intentionally omitted from workspace documentation only by an explicit human decision.

Sol plans and hands off one self-contained prompt. Luna is executor-only: she implements the authorized scope, runs authorized local validation, checkpoints execution state, and stops at `IMPLEMENTATION_COMPLETE` or `BLOCKED`. Luna does not self-review, create subagents, commit, push, open or update PRs, or mutate publication state.

After local validation and trusted publication, routine code review is performed by managed Codex GitHub Code Review. Trigger it manually with `@codex review`; automatic review is disabled by default to avoid duplicate runs. Treat a review as current only when its reviewed commit SHA matches the current PR head. Codex is reviewer-only: do not use `@codex fix`, `@codex address that feedback`, or any other command that asks Codex to mutate the branch. Reviewer findings stay separate from Luna execution checkpoints and are not sent back to Luna until a human explicitly authorizes a correction pass; when authorized, send one consolidated findings package. After any correction changes the PR head, trigger a new `@codex review` and require the new reviewed commit SHA to match the new head. Sol 5.6 High is reserved for escalation or fallback: architecture/high-risk review, ambiguous or disputed findings, Codex unavailability, or explicit human request. Publication remains under Sol/human control, and only a human merges.

Use persisted task state for long or audit-significant work. Never store credentials, private keys, `.env` content, or conversation dumps.
