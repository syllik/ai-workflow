# Canonical workflow

GitHub is authority: `AI.md -> FLOW.md -> workspace record -> global/workflow.md -> selected role -> target AGENTS.md/.ai/context.md -> relevant decisions/tasks`. Use `integrationBranch`; no repo auto-discovery. Active managed projects may work; onboarding only onboarding/alignment; read-only projects are never write targets. `contextDependencies` are task-scoped read-only. Missing required context blocks work; Issue/PR entry does not bypass this route.

Roles are provider-independent: Planner scopes; Architect is risk-triggered; Executor implements/validates; Reviewer independently reviews one pinned SHA without mutations; Auditor checks evidence/policy/cost. Models follow capability/risk, not role. Trusted Publisher is separate.

v2 requires pinned policy/base/head provenance plus upfront approval: allowed paths, publication permission, `maxCorrectionBatches` 0–2. Legacy v1/unspecified handoffs keep existing human gates and gain no automatic publication/correction authority. Implementation keeps the exact 32768-byte UTF-8 assembled-context gate.

Publish each completed revision as one final commit + one push; never rewrite published history. Review only after required CI is green for current head; one review per SHA and consolidated findings. Head changes stale prior CI/review. Corrections use v2 upfront authority; legacy corrections require human approval per batch. After two correction batches, escalate. Human merges.

New `workspace.yaml` projects require synced `syllik/syllik` `docs/workspace.md` and `docs/repositories.md`; profile `README.md` stays a stable workspace link. this policy changes no deployment/merge settings.

ChipIn task identity is `owner/repository#issue`; Issue owns specification/dependencies, Organization Issue Fields metadata, Project #5 Status workflow. Trello is read-only history. Status never authorizes execution. Descriptions use `Problem -> Outcome -> Acceptance -> Dependencies -> References`; evidence in results/comments.


Before constructing an executable task handoff, require live read-only canonical `chipin-issue-admission/v1` for ChipIn FE/BE/KB; recheck at Executor start, Trusted Publisher before push/PR publication, and Reviewer/handoff against current Issue revision. BLOCKED on unavailable native type/fields/assignees/Project #5, incomplete body, wrong identity, stale read-back or connector QUEUED. `INTAKE_COMPLETE` is an admission prerequisite, never human approval or permission for model execution. Org governance #53 bootstrap is narrow, manual and non-transferrable; raw connector calls cannot be intercepted, so their downstream continuation must be stopped.
