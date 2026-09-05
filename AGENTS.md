# AI agent rules

## Reading order

`AI.md` and `FLOW.md` are the canonical entry points for workflow and context
storage. Before working, read:

1. `AI.md`;
2. `FLOW.md`;
3. one record from `workspace.yaml` and `projects/index.md`;
4. the relevant role file from `global/architect.md`, `global/executor.md`, or `global/reviewer.md`;
5. `AGENTS.md` and `.ai/context.md` in the target repository;
6. only relevant `.ai/decisions.md` and task files.

For a persisted task, also use its `prompt.md` and current `state.md`. The
human-only `plan.md` is reviewed by the user; Luna never reads it. Do not reread
task history without a concrete reason.

The GitHub organization at `https://github.com/syllik` and the task prompt are
sufficient bootstrap. Do not require external project settings or read every
project, prompt, task, or history file without a concrete reason.

## Core rules

* GPT-5.6 Sol is the planner, architect, research agent, and independent reviewer; it issues one self-contained execution prompt for implementation and performs review as a separate role.
* Luna xhigh is the executor and coder only; it reads target repository instructions, implements the authorized scope, and runs authorized validation.
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
* Luna does not self-review, stage, commit, push, open or update PRs, merge, enable auto-merge, or mutate GitHub/Trello publication state.
* Do not create unnecessary documentation or perform unrelated refactoring.
* Update canonical project context only when durable knowledge appears.
* Never store secrets, credentials, tokens, private keys, or `.env` contents.
* User-facing explanations and documentation should be in English for agent-executable workflow files; retain technical identifiers in English.
<!-- ai-workflow:agents-routing:start -->
Canonical AI routing:
1. Read the canonical workflow: https://github.com/syllik/ai-workflow/blob/HEAD/FLOW.md.
2. Select one GitHub record from https://github.com/syllik/ai-workflow/blob/HEAD/workspace.yaml / https://github.com/syllik/ai-workflow/blob/HEAD/projects/index.md.
3. Read the relevant role rules from https://github.com/syllik/ai-workflow/tree/HEAD/global (`architect.md`, `executor.md`, or `reviewer.md`).
4. Read target `AGENTS.md`, then target `.ai/context.md`.
5. Read only relevant `.ai/decisions.md` and task files.

Use GitHub records only. Legacy `projects/<project>/` contexts are migration-only; do not auto-discover repositories.
Canonical root: ~/Desktop/WORK
<!-- ai-workflow:agents-routing:end -->
