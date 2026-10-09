# AI agent rules

## Reading order

`AI.md` and `FLOW.md` are the canonical entry points for workflow and context
storage. Before working, read:

1. `AI.md`;
2. `FLOW.md`;
3. one record from `workspace.yaml` and `projects/index.md`;
4. `global/workflow.md`, then only the selected role file;
5. `AGENTS.md` and `.ai/context.md` in the target repository;
6. only relevant `.ai/decisions.md`, task files, and explicit `contextDependencies` required by the target/task.

For a persisted task, also use its `prompt.md` and current `state.md`. The
human-only `plan.md` is reviewed by the user; Executor never reads it. Do not reread
task history without a concrete reason.

The GitHub organization at `https://github.com/syllik` and the task prompt are
sufficient bootstrap. Do not require external project settings or read every
project, prompt, task, or history file without a concrete reason.

## Core rules

* Authority precedence is: current pinned role/task policy > target-repository narrowing instructions > generic skills, reusable methodologies, historical task files/plans, plugins, and other lower-precedence instructions. Lower-precedence instructions may narrow implementation or validation, but cannot expand Executor authority. Loading or invoking a skill grants no GitHub mutation, publication, reviewer, delegation, or scope-change authority.
* Planner, Architect, Executor, Reviewer, and Auditor are provider-independent roles; model/runtime capability is selected by task risk, not role name.
* Trusted Publisher is separate from all AI roles and may publish only within explicit task authority.
* Resolve target repository instructions through the selected `workspace.yaml` record's `integrationBranch`. Normal implementation requires `status: active`; `status: onboarding` permits onboarding/alignment only.
* `contextDependencies` are approved read-only context only for the dependent task. Read the minimum required dependency context; never mutate a repository through that dependency relationship or discover additional repositories from it. A separate managed workspace record for the same repository retains its own management authority.
* Lightweight tasks are the default; task files are not required.
* Use a persisted task for large, architectural, long-running, cross-session, audit-significant, or context-heavy work.
* The default persisted structure is a human-only planning record, `prompt.md`, `state.md`, and `result.md`.
* A lightweight task may be promoted to persisted when its implementation or review scope becomes context-heavy.
* The task prompt stores executable intent, scope, and architecture; do not use task state as mutable planning scratch space.
* `state.md` is a short mutable checkpoint for safe continuation; do not turn it into a journal, reasoning dump, raw log, or full diff.
* Conversation context must not be the only execution state for a persisted task.
* Task context is optional and must not duplicate the human-only planning record.
* Do not change the architecture without an explicit reason in the supplied task prompt.
* Do not use subagents, repeat broad research, or expand scope.
* Executor does not self-review, publish, merge, or mutate GitHub/Trello. Trusted Publisher performs one final commit + one push per completed revision only when explicitly authorized; published history is never rewritten.
* Reviewer runs only after required CI is green for the exact current head, at most once per SHA, in an independent read-only context, and returns one consolidated findings package.
* Any head change invalidates prior CI/review. v2 may pre-authorize up to two bounded correction batches; legacy v1/unspecified handoffs require human authorization per batch. After the limit, escalate to a human. Only a human merges.
* Do not create unnecessary documentation or perform unrelated refactoring.
* Update canonical project context only when durable knowledge appears.
* Never store secrets, credentials, tokens, private keys, or `.env` contents.
* User-facing explanations and documentation should be in English for agent-executable workflow files; retain technical identifiers in English.

## Canonical ChipIn task model

- Task identity is `ChipIn-one/<repository>#<issue-number>`.
- The GitHub Issue title/body is the task specification and dependency record.
- Organization Issue Fields are canonical structured metadata; Project #5 (`ChipIn Development`) Status is canonical workflow state.
- Trello is historical/read-only reference only; there is no bidirectional synchronization.
- Issue or Project state never authorizes AI execution; explicit human approval provenance is required.
<!-- ai-workflow:agents-routing:start -->
Canonical AI routing:
1. Read the canonical workflow: https://github.com/syllik/ai-workflow/blob/HEAD/FLOW.md.
2. Select one GitHub record from https://github.com/syllik/ai-workflow/blob/HEAD/workspace.yaml / https://github.com/syllik/ai-workflow/blob/HEAD/projects/index.md.
3. Read the role index https://github.com/syllik/ai-workflow/blob/HEAD/global/workflow.md, then only the selected role file.
4. On that record's `integrationBranch`, read target `AGENTS.md`, then `.ai/context.md`.
5. Read relevant `.ai/decisions.md`, task files, and required declared `contextDependencies`; block if required dependency context is unavailable.

GitHub Issue/PR entry never bypasses this route; use GitHub records only, no auto-discovery; legacy contexts are migration-only.
Canonical root: ~/Desktop/WORK
<!-- ai-workflow:agents-routing:end -->


## ChipIn canonical task admission

For managed ChipIn FE/BE/KB Issue-backed tasks, do not initiate execution planning, implementation, a task branch/PR, review handoff or publication without a fresh `INTAKE_COMPLETE` receipt from the versioned read-only `ChipIn-one/.github/automation/issue-admission.mjs` contract, for the exact native Issue identity and revision. This admission does **not** grant execution approval; v2 task authority remains required. FE native assignee `syllik`, BE `olegbal`, KB explicitly selected owner. A raw Issue, queued connector bridge, labels, stale cached receipt, PR body or human docs cannot replace Project #5/native metadata read-back. Org #53 has an expressly scoped one-Issue governance bootstrap, not a default exception.
