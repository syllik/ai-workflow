# Luna execution contract: workflow foundation correction

You are Luna xhigh. Do not use subagents.

## Repository contract

Work only in:
`/Users/mihaildovgun/Desktop/WORK/workflows/ai/ai-workflow`

Repository: `syllik/ai-workflow`  
Branch: `task/github-rooted-agent-architecture`  
Existing PR: `https://github.com/syllik/ai-workflow/pull/4` into `master`  
Pre-correction implementation head: `06b293d9e1de1697c07efec6fd5dc0907c1d025b`

The immutable correction handoff commit is supplied in the launcher. Treat that launcher SHA as authoritative; do not infer it from this file.

Before reading implementation files:

1. Run `git status --short --branch`, `git worktree list`, and inspect remotes.
2. Safe-stop on uncommitted work, collisions, wrong repository, wrong branch, or unexpected remote.
3. Run `git fetch origin`.
4. The local branch may be at the pre-correction head. Fast-forward only to the launcher-pinned handoff commit. Do not reset, rebase, stash, force-push, or discard work.
5. Verify `git rev-parse HEAD` equals the launcher-pinned handoff SHA.

Read this file and:
`.ai/tasks/github-rooted-workflow-foundation-correction/state.md`

Do not read any `plan.md`; Russian files are human-only. Read only task-relevant source, tests, generated outputs, and the existing English workflow/context files.

## Goal

Correct the Phase 1A implementation in the same branch and PR so it matches the approved GitHub-rooted architecture. Keep the change bounded and test-driven.

## Required corrections

### 1. Extensible manifest

Remove exact-project enumeration and exact-set comparison from `scripts/workspace/manifest.mjs`. The manifest itself is the explicit allowlist. Validation must remain strict for schema, duplicate IDs/repositories/paths, safe relative paths, access/status combinations, exclusions, and `contextPath` rules.

Add a test proving a new valid approved repository entry is accepted without changing source constants. Keep the current eight entries only in `workspace.yaml`.

### 2. Real apply is a supported product operation

Remove the permanent `CANONICAL_APPLY_FORBIDDEN` behavior. The engine must permit `apply` with canonical root `/Users/mihaildovgun/Desktop/WORK` after normal safety checks.

Do not run real apply against that path in this task. Tests must use isolated temporary fixtures and prove the canonical-root string is not rejected merely because it is canonical.

### 3. Separate manifest location from workspace root

Refactor CLI/options so:

- manifest defaults to `workspace.yaml` in the `ai-workflow` checkout;
- an explicit `--manifest <path>` may override it;
- `--root <path>` controls only the target workspace root;
- `--root` never causes lookup of `<root>/workspace.yaml`.

Add CLI tests for default and explicit manifest resolution with a distinct fixture workspace root.

### 4. Repository-local managed contract

`plan`/`apply` must target each managed repository at `<workspaceRoot>/<localPath>`. Plan routing-block work for that repository's `AGENTS.md` and scaffold its missing `.ai/context.md` and `.ai/decisions.md` according to the approved safe/no-overwrite rules.

Do not generate a workspace-root `AGENTS.md`. Preserve existing repository content outside the exact managed block. Add tests with at least two managed repositories at different local paths.

### 5. Read-only clone without writes

A missing allowlisted read-only repository may be cloned so the workspace is reproducible and Sol can read it. After clone, no file creation, scaffold, managed-block update, branch, commit, push, PR, or Issue is allowed in that repository.

Add tests proving:
- missing read-only produces only a clone operation;
- present read-only produces no write operations;
- `ChipIn-one/chipin-backend` never receives `AGENTS.md` or `.ai` operations.

Never execute or publish anything in `ChipIn-one/chipin-backend`.

### 6. GitHub-native project index

Render repository navigation with absolute GitHub URLs, not local relative paths.

- Managed entry context URL: `https://github.com/<owner>/<repo>/blob/HEAD/.ai/context.md` (or an equally branch-independent GitHub URL).
- Read-only entry: repository URL only, labeled as repository source of truth.
- Never render a backend `.ai/context.md` link.

Add exact rendering tests for managed and read-only entries.

### 7. English GitHub-only routing and truthful state

Agent-executable routing, generated blocks, `AGENTS.md`, `AI.md`, and `FLOW.md` must be English. Human-only Russian plans may remain Russian. Remove any statement that ChatGPT Project Instructions are required; `https://github.com/syllik` plus the task must be a sufficient bootstrap.

Correct `.ai/tasks/github-rooted-workflow-foundation/state.md` so it does not claim the original handoff commit is the current branch/PR head. Mark the prior result as superseded by this correction where needed. State must distinguish:

- original immutable handoff: `2fca3e40ec86c76cf3e2e581bf08f164c2f920c6`;
- pre-correction implementation head: `06b293d9e1de1697c07efec6fd5dc0907c1d025b`;
- current PR head: mutable and verified from GitHub/Git.

Update PR #4 body so it says real canonical apply was not executed during Phase 1A, not that the product permanently blocks it.

## Constraints

- No dependency or lockfile changes.
- No broad refactor or new architecture.
- Preserve unrelated work and legacy storage.
- Modify only `syllik/ai-workflow`.
- Do not run a real canonical workspace apply.
- Do not touch excluded repositories.
- Do not create a new branch or PR.
- Never merge, enable auto-merge, force-push, delete branches, or push to `master`.
- Keep byte budgets: prompt 8 KB, state 2 KB, result 4 KB, human plan 16 KB, plus existing artifact budgets.

## TDD and checkpoints

For each correction group:

1. Add a focused failing test that exposes the defect.
2. Run it and confirm failure for the intended reason.
3. Make the smallest production change.
4. Run the focused test and related suite.
5. Commit a coherent unit to the authorized branch.

Update `.ai/tasks/github-rooted-workflow-foundation-correction/state.md` only at meaningful boundaries. Create `result.md` only after all verification passes.

## Completion gates

Run and record:

- all focused tests;
- `npm test`;
- `npm run verify`;
- `git diff --check`;
- full review of the task-owned diff;
- `git status --short --branch`;
- PR #4 head/status and configured remote checks.

Confirm no real apply ran and no repository other than `syllik/ai-workflow` changed. Push only the authorized branch and update PR #4. Finish state/result at `READY_FOR_HUMAN_MERGE`, then stop for Sol review and human merge.
