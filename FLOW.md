# Canonical workflow

GitHub is project/task authority:
`AI.md -> FLOW.md -> workspace record -> role -> target AGENTS.md/.ai/context.md -> relevant decisions/tasks`.
Use `integrationBranch`; no repo auto-discovery. Active managed projects may work; onboarding managed projects only onboarding/alignment; Read-only projects are never write targets. `contextDependencies` are task-scoped read-only context; they do not override separate managed records. Missing required context blocks work.
GitHub-only/web-agent bootstrap: target Issue/PR entry never bypasses this route; read current target `AGENTS.md` first.

New repos need a license choice before first commit; research analogues and prefer viable licensed reuse/forks.
A new `workspace.yaml` project requires synced `syllik/syllik` `docs/workspace.md` and `docs/repositories.md`; profile `README.md` keeps a stable link.

Git lifecycle: audited repos target `master` as canonical long-lived source; normal PRs squash. Deployment profiles are `none|staging|production`; environments are not source branches. Non-`master` migrations/exceptions must be recorded in `workspace.yaml`; production promotes an exact tested commit/tag. Temporary issue branches use `<type>/issue-<number>-<slug>`. Policy work never renames/deletes branches; cleanup follows human merge.

Sol produces one bounded prompt. Luna implements and validates only; no self-review, subagents, commit, push, PR publication/update, or publication-state mutation.

Trusted publication creates/updates PRs. Post `@codex review` only after green full CI for current head; head changes require fresh CI/review. Codex is reviewer-only; only a human merges.

Persist state for long/audit-significant work. Never store secrets or credentials.

ChipIn: `owner/repository#issue`; Issue specifies work/dependencies, Organization Issue Fields metadata, Project #5 Status workflow. Trello is read-only history. Status never authorizes execution; explicit human approval is required.
