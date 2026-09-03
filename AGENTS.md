# AI agent rules

## Reading order

`AI.md` and `FLOW.md` are the canonical entry points for workflow and context
storage. Before working, read:

1. `AI.md`;
2. `FLOW.md`;
3. one record from `workspace.yaml` and `projects/index.md`;
4. the relevant role file from `global/architect.md` or `global/executor.md`;
5. `AGENTS.md` and `.ai/context.md` in the target repository;
6. only relevant `.ai/decisions.md` and task files.

For a persisted task, also use its `prompt.md` and current `state.md`. Read a
human-only `plan.md` only when the task prompt permits it. Do not reread task
history without a concrete reason.

The GitHub workflow repository and the task prompt are sufficient bootstrap.
Do not require external project settings or read every project, prompt, task,
or history file without a concrete reason.

## Core rules

* GPT-5.6 Sol is the planner, architect, and research agent; it issues one self-contained execution prompt.
* Luna xhigh is the executor, coder, and reviewer; it reads target repository instructions, implements, verifies, and reviews the diff.
* Lightweight tasks are the default; task files are not required.
* Use a persisted task for large, architectural, long-running, cross-session, audit-significant, or context-heavy work.
* The default persisted structure is `plan.md`, `prompt.md`, `state.md`, and `result.md`.
* A lightweight task may be promoted to persisted when its implementation or review scope becomes context-heavy.
* `plan.md` stores approved intent, scope, and architecture; do not use it as mutable execution scratch space.
* `state.md` is a short mutable checkpoint for safe continuation; do not turn it into a journal, reasoning dump, raw log, or full diff.
* Conversation context must not be the only execution state for a persisted task.
* Task `context.md` is optional and must not duplicate `plan.md`.
* When an approved `plan.md` exists, do not change the architecture without an explicit reason.
* Do not use subagents, repeat broad research, or expand scope.
* Luna may stage task-owned files, commit, push an authorized task branch, and open or update a PR when the task workflow permits it; Luna never merges or enables auto-merge.
* Do not create unnecessary documentation or perform unrelated refactoring.
* Update canonical project context only when durable knowledge appears.
* Never store secrets, credentials, tokens, private keys, or `.env` contents.
* User-facing explanations and documentation should be in English for agent-executable workflow files; retain technical identifiers in English.
<!-- ai-workflow:agents-routing:start -->
Canonical AI routing:
1. Read `FLOW.md`.
2. Select one GitHub record from `workspace.yaml` / `projects/index.md`.
3. Read role rules from `global/architect.md` or `global/executor.md`.
4. Read target `AGENTS.md`, then target `.ai/context.md`.
5. Read only relevant `.ai/decisions.md` and task files.

Use GitHub records only. Legacy `projects/<project>/` contexts are migration-only; do not auto-discover repositories.
Canonical root: ~/Desktop/WORK
<!-- ai-workflow:agents-routing:end -->
