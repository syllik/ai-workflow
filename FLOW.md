# Canonical workflow

GitHub authority: `AI.md -> FLOW.md -> workspace record -> global/workflow.md -> selected role -> target AGENTS.md/.ai/context.md -> relevant decisions/tasks`. Use `integrationBranch`; no repo auto-discovery. Active managed work; onboarding only onboarding/alignment; read-only projects are never write targets. `contextDependencies` are task-scoped read-only. Missing required context blocks work; Issue/PR entry does not bypass this route.

Roles are provider-independent: Planner scopes, Architect handles risks, Executor implements, Reviewer independently reviews pinned SHA without mutations, Auditor checks evidence. Select capability/risk, not provider. Trusted Publisher is separate. The main session may orchestrate role subagents under `global/core.md`.

v2 pins policy/base/head plus approval (paths, publication, 0–2 corrections). Legacy v1/unspecified remains human-gated; no automatic publication/correction. Context has no fixed byte cap: basic v1 (default) or verified v2 (Task Contract v2, trusted source/coverage/integrity evidence); see `global/executor.md`.

Publish one final commit + one push; never rewrite published history. Review only after required CI green for current head; one review per SHA and consolidated findings. Head changes stale CI/review. v2 corrections require upfront authority; legacy requires human approval per batch. After two correction batches, escalate. Human merges.

New `workspace.yaml` projects sync `syllik/syllik` `docs/workspace.md` and `docs/repositories.md`; `README.md` stays a stable workspace link. No deployment/merge settings change.

ChipIn pre-PR routing: use `scripts/workspace/chipin-admission-route.mjs` at executable planning, Executor start, publication, review and correction (see `global/core.md`). Only fresh exact-Issue/revision `chipin-issue-admission/v1` INTAKE_COMPLETE plus separate approval/context passes. Issue owns spec; Organization Issue Fields metadata; Project #5 Status workflow, not authority. Trello is read-only history. Descriptions use `Problem -> Outcome -> Acceptance -> Dependencies -> References`; evidence in results/comments.
