# Canonical workflow

GitHub is project/task authority:
`AI.md -> FLOW.md -> workspace record -> role -> target AGENTS.md/.ai/context.md -> relevant decisions/tasks`.
Use `integrationBranch`; no repo auto-discovery. Active managed projects may work; onboarding is alignment-only; read-only projects are never write targets. `contextDependencies` are task-scoped read-only context and never expand write authority. Missing required context blocks work.
GitHub-only/web-agent bootstrap: target Issue/PR entry never bypasses this route; read target `AGENTS.md` first.

New repos need a license choice before first commit. For new tools, research analogues; prefer viable licensed reuse/forks.
A new workspace project requires synced `syllik/syllik` `docs/workspace.md` / `docs/repositories.md`.

Git lifecycle: audited repositories use `master` as canonical long-lived source and squash normal PRs. Deployment profiles are `none|staging|production`; environments are not source branches. Non-`master` migration or temporary exceptions must be explicit in `workspace.yaml`. Production promotes an exact tested commit/tag. Temporary issue branches use `<type>/issue-<number>-<slug>`. Policy-only work never renames/deletes branches; cleanup follows verified human merge.

Sol produces one bounded prompt. Luna is executor-only: implement, validate, checkpoint; stop at `IMPLEMENTATION_COMPLETE` or `BLOCKED`. No self-review, subagents, commit, push, PR publication/update, or publication-state mutation.

Trusted publication creates/updates PRs. Trigger `@codex review` only after green full CI for the current head; head changes require fresh CI/review. Codex is reviewer-only; only a human merges.

Persist state for long/audit-significant work. Never store secrets or credentials.

ChipIn authority: identity is `owner/repository#issue`; Issue specifies work/dependencies; Organization Issue Fields carry metadata; Project #5 Status is workflow. Trello is read-only history. Status never authorizes execution; explicit human approval is required.
