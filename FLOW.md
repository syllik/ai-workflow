# Canonical workflow

GitHub is the only project/task authority:
`AI.md -> FLOW.md -> workspace record -> role -> target AGENTS.md/.ai/context.md -> relevant decisions/tasks`.
Use `integrationBranch`; no repo auto-discovery. Active managed projects may work; onboarding managed projects only onboarding/alignment; Read-only projects are never write targets. Required `contextDependencies` are read-only; unavailable required context blocks work.

New repos need human licensing before first commit. Net-new tools require analogue research and should prefer viable licensed reuse/fork over greenfield.

Adding a project to `workspace.yaml` requires synchronized `syllik/syllik` updates to `docs/workspace.md` and `docs/repositories.md`; profile `README.md` keeps a stable workspace link.

Sol produces one bounded prompt. Luna is executor-only: implement, validate, checkpoint, stop at `IMPLEMENTATION_COMPLETE` or `BLOCKED`. No self-review, subagents, commit, push, PR publication/update, or publication-state mutation.

Trusted publication creates or updates the PR. Managed Codex GitHub Code Review runs automatically on every push to an open PR. A review is valid only for the current PR head; changed heads require a fresh review. `@codex review` is fallback/retrigger only; never duplicate a running automatic review. Codex is reviewer-only: never use `@codex fix` or branch-mutation commands. Findings reach Luna only after explicit human authorization. Sol 5.6 High is escalation/fallback only. Only a human merges.

Use persisted state for long/audit-significant work. Never store secrets or credentials.

ChipIn authority: identity is `owner/repository#issue`; Issue = specification/dependencies; Organization Issue Fields = structured metadata; ChipIn Development Project #5 Status = workflow. Trello is historical/read-only only; no sync. Status never authorizes execution; explicit human approval provenance is required. Descriptions use `Problem -> Outcome -> Acceptance -> Dependencies -> References`; evidence in results/comments.
