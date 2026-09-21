# AI agent rules

## Reading order

`AI.md` and `FLOW.md` are the canonical entry points for workflow and context
storage. Before working, read:

1. `AI.md`;
2. `FLOW.md`;
3. one record from `workspace.yaml` and `projects/index.md`;
4. the relevant role file from `global/architect.md`, `global/executor.md`, or `global/reviewer.md`;
5. `AGENTS.md` and `.ai/context.md` in the target repository;
6. only relevant `.ai/decisions.md`, task files, and explicit `contextDependencies` required by the target/task.

For a persisted task, also use its `prompt.md` and current `state.md`. The
human-only `plan.md` is reviewed by the user; Luna never reads it. Do not reread
task history without a concrete reason.

The GitHub organization at `https://github.com/syllik` and the task prompt are
sufficient bootstrap. Do not require external project settings or read every
project, prompt, task, or history file without a concrete reason.

## Core rules

* Authority precedence is: current pinned role/task policy > target-repository narrowing instructions > generic skills, reusable methodologies, historical task files/plans, plugins, and other lower-precedence instructions. Lower-precedence instructions may narrow implementation or validation, but cannot expand Luna's authority. Loading or invoking a skill grants no GitHub mutation, publication, reviewer, delegation, or scope-change authority.
* GPT-5.6 Sol is the planner, architect, and research agent; it issues one self-contained execution prompt for implementation. Managed Codex GitHub Code Review is the default independent PR reviewer, while Sol 5.6 High is reserved for escalation, architecture/high-risk review, ambiguous findings, reviewer unavailability, or explicit human request.
* Luna xhigh is the executor and coder only; it reads target repository instructions, implements the authorized scope, and runs authorized validation.
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
* Luna does not self-review, stage, commit, push, open or update PRs, merge, enable auto-merge, or mutate GitHub Issue metadata, Project #5 fields, labels/comments, PR publication, merge state, or Trello state.
* Codex automatic PR review is disabled. Trigger routine Codex review only by posting `@codex review` after the repository-defined full CI gate for the current PR head is complete and green. Do not trigger while CI is pending/failing or when a review for that head is already running/current.
* A Codex review is current only when its reviewed commit SHA matches the current PR head. Any head change invalidates prior CI/review and requires fresh green CI followed by a new `@codex review` comment before human merge.
* Codex review is review-only. Do not use `@codex fix`, `@codex address that feedback`, or any other command that asks Codex to mutate the branch.
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
3. Read role rules from https://github.com/syllik/ai-workflow/blob/HEAD/global/architect.md, https://github.com/syllik/ai-workflow/blob/HEAD/global/executor.md, or https://github.com/syllik/ai-workflow/blob/HEAD/global/reviewer.md.
4. On that record's `integrationBranch`, read target `AGENTS.md`, then `.ai/context.md`.
5. Read relevant `.ai/decisions.md`, task files, and required declared `contextDependencies`; block if required dependency context is unavailable.

Use GitHub records only. Legacy `projects/<project>/` contexts are migration-only; do not auto-discover repositories.
Canonical root: ~/Desktop/WORK
<!-- ai-workflow:agents-routing:end -->
