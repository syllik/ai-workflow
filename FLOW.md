# Canonical workflow

GitHub is the only project/task authority:
`AI.md -> FLOW.md -> workspace record -> role -> target AGENTS.md/.ai/context.md -> relevant decisions/tasks`.
Workspace metadata is explicit: `integrationBranch` routes source; `lifecycle` is code-only/staging/production; `branchState` is canonical/migration/external/integration-exception. Canonical managed history is `feature/* -> PR -> squash -> master`; staging/production are environments, not mandatory branches. See `docs/git-workflow.md`. No repo auto-discovery. Active managed projects may execute; onboarding is alignment-only; read-only projects are never write targets. Required `contextDependencies` are read-only and blocking if unavailable.

New repos need human licensing before first commit; net-new tools require analogue research and prefer viable licensed reuse/fork.

Adding a project requires synchronized `syllik/syllik` updates to `docs/workspace.md` and `docs/repositories.md`.

Sol produces one bounded prompt. Luna executes and validates only, stopping at `IMPLEMENTATION_COMPLETE` or `BLOCKED`; no self-review, subagents, commit, push, PR mutation, or publication-state mutation.

Trusted publication creates/updates the PR. Managed Codex review runs on every push. Review is valid only for the current PR head; changed heads need fresh review. `@codex review` is fallback/retrigger only; Codex is reviewer-only. Findings reach Luna only after explicit human authorization. Sol 5.6 High is escalation/fallback. Only a human merges.

Use persisted state for long/audit-significant work. Never store secrets.

ChipIn authority: identity is `owner/repository#issue`; Issue = specification/dependencies; Organization Issue Fields = structured metadata; Project #5 Status = workflow. Trello is historical/read-only only; no sync. Status never authorizes execution; explicit human approval provenance is required. Descriptions use `Problem -> Outcome -> Acceptance -> Dependencies -> References`; evidence in results/comments.
