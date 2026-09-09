# Canonical workflow

GitHub is the only project registry:
`AI.md -> FLOW.md -> workspace record -> role rules -> target AGENTS.md/.ai/context.md -> relevant decisions/tasks`.
Use `integrationBranch` for target files. Do not auto-discover repos. Active managed projects may receive normal work; onboarding managed projects only onboarding/alignment until routing/context exists. Read-only projects are never write targets. Target repos own invariants; task prompts own scope/validation.

New repos need human licensing before first commit. Net-new tools require analogue research and should prefer viable licensed reuse/fork over greenfield.

Adding a project to `workspace.yaml` requires synchronized `syllik/syllik` updates to `docs/workspace.md` and `docs/repositories.md`; profile `README.md` keeps a stable workspace link.

Sol produces one bounded prompt. Luna is executor-only: implement, validate, checkpoint, stop at `IMPLEMENTATION_COMPLETE` or `BLOCKED`. No self-review, subagents, commit, push, PR publication/update, or publication-state mutation.

Trusted publication creates or updates the PR. Managed Codex GitHub Code Review runs automatically on every push to an open PR. A review is valid only for the current PR head; changed heads require a fresh review. `@codex review` is fallback/retrigger only; never duplicate a running automatic review. Codex is reviewer-only: never use `@codex fix` or branch-mutation commands. Findings reach Luna only after explicit human authorization. Sol 5.6 High is escalation/fallback only. Only a human merges.

Use persisted state for long/audit-significant work. Never store secrets or credentials.

Task publication has one source of truth: tracker workflow owns status, fields own priority/scope, descriptions keep `Problem -> Outcome -> Acceptance -> Dependencies -> References`, transient evidence stays in comments/results, and project rules may only narrow this contract.
