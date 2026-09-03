# Luna execution contract: workflow foundation correction 2

You are Luna xhigh. Do not use subagents.

## Repository contract

Work only in:
`/Users/mihaildovgun/Desktop/WORK/workflows/ai/ai-workflow`

Repository: `syllik/ai-workflow`  
Branch: `task/github-rooted-agent-architecture`  
Existing PR: `https://github.com/syllik/ai-workflow/pull/4` into `master`  
Pre-correction-2 head: `656d3d4cefddef771c2aa205c878009b5fd8eff0`

The immutable correction-2 handoff commit is supplied by the launcher and is authoritative.

Before reading implementation files:

1. Run `git status --short --branch`, `git worktree list`, and `git remote -v`.
2. Safe-stop on uncommitted work, collision, wrong repository/branch, or unexpected remote.
3. Run `git fetch origin`.
4. The local branch may be at the pre-correction-2 head. Fast-forward only to the launcher-pinned handoff with `git merge --ff-only origin/task/github-rooted-agent-architecture`.
5. Verify `git rev-parse HEAD` equals the launcher SHA. Never reset, rebase, stash, force-push, or discard work.

Read this file and:
`.ai/tasks/github-rooted-workflow-foundation-correction-2/state.md`

Do not read any `plan.md`; they are human-only. Read only relevant English workflow files, source, tests, generated outputs, and prior correction state/result when needed.

## Goal

Remove five verified blockers from Phase 1A in the same branch and PR. Keep the approved architecture and use test-first, bounded changes.

## Required corrections

### 1. Preserve durable project context

Current behavior treats every populated `.ai/context.md` as `POPULATED_CONTEXT`, blocks `plan/apply`, and requires byte equality with an empty generated block. This makes the real `ai-workflow` context block canonical apply and prevents project facts from being stored.

Required behavior:

- if a managed context is missing, plan/create a useful project-context scaffold;
- if it exists as a regular file, preserve its content exactly and do not report drift merely because it differs from the scaffold;
- enforce the 8 KB UTF-8 budget on existing and new context;
- block filesystem collisions such as a directory at the context path;
- decisions remain create-if-missing and never overwrite populated content;
- remove `POPULATED_CONTEXT` as an expected normal state.

Prefer a context scaffold compatible with `templates/project.md`; do not add a mutable generated block that would prevent durable project facts.

Tests must prove the current non-generated `.ai/context.md` form is accepted, unchanged after apply, budget-checked, and idempotent.

### 2. Make routing valid from every repository

`renderAgentsBlock` is installed in target repositories but currently refers to local `FLOW.md`, `workspace.yaml`, `projects/index.md`, and `global/*`, which do not exist there.

Generate compact English routing using absolute canonical GitHub URLs:

- `https://github.com/syllik/ai-workflow/blob/HEAD/FLOW.md`
- `https://github.com/syllik/ai-workflow/blob/HEAD/workspace.yaml`
- `https://github.com/syllik/ai-workflow/blob/HEAD/projects/index.md`
- role files below `https://github.com/syllik/ai-workflow/blob/HEAD/global/`

Only the selected target's `AGENTS.md`, `.ai/context.md`, `.ai/decisions.md`, and task files are repository-local. Keep the managed block below 1 KB.

Make `renderProfileNavigation` route from `syllik/syllik` to the same absolute canonical GitHub entry. Tests must reject ambiguous relative central paths and assert exact canonical URLs.

### 3. Make one apply converge

For a missing managed repository, one CLI invocation of `workspace apply` must:

1. clone only the manifest-allowlisted repository;
2. verify destination containment, Git root, origin, cleanliness, and worktree safety after clone;
3. create the missing repository-local `AGENTS.md`, context scaffold, and decisions scaffold;
4. perform a final read-only re-plan/check;
5. return success only when no pending operations or blocking findings remain.

A missing read-only repository is cloned and then receives zero file writes. Keep execution bounded: no uncontrolled loop or retry. An explicit maximum of the required clone/scaffold passes is acceptable.

Add an end-to-end isolated test using local fixture remotes; do not use network or the real workspace. The test must invoke the CLI/apply orchestration once and then prove a second plan has zero operations.

### 4. Inspect only known budget artifacts

Replace broad `walkFiles(root)` behavior. Canonical check must not recursively read unrelated source trees, binaries, build output, or every repository file.

Collect only:

- manifest-repository `AI.md`, `FLOW.md`, applicable `global/*.md`, and `.ai/tasks/**/{plan,prompt,state,result}.md`;
- each existing managed target's configured context, `.ai/decisions.md`, task Markdown, and managed AGENTS block.

Resolve central artifacts relative to the manifest directory and target artifacts relative to `workspaceRoot/localPath`. Preserve containment and skip symlinks/non-files safely.

Enforce all existing budgets, including human `plan.md` at 16 KB. Add tests with:
- manifest directory distinct from workspace root;
- oversized central role/task files detected;
- oversized target context/task files detected;
- an unrelated unreadable or large sentinel outside known paths not read or reported.

Do not broaden scanning to read-only repositories.

### 5. Keep plan human-only

Remove or correct every executable instruction that tells Luna to read `plan.md`, including the README resume section. The durable contract is:

- user reviews Russian `plan.md`;
- Luna never reads plan files;
- Luna executes English `prompt.md`;
- Luna reads English `state.md` only for resume;
- prompt is self-contained and architecture changes require explicit user/Sol escalation.

Search the changed workflow files for contradictory plan-reading instructions and add a regression test or deterministic verification where practical.

## Scope and safety

- No dependency, lockfile, project-list, or architecture changes.
- Modify only `syllik/ai-workflow`.
- Never write to `ChipIn-one/chipin-backend` or excluded repositories.
- Do not run real apply against `/Users/mihaildovgun/Desktop/WORK`.
- Preserve unrelated work and legacy storage.
- Keep the same branch and PR #4; do not create another PR.
- Never push to `master`, merge, enable auto-merge, force-push, or delete branches.
- Maintain existing UTF-8 budgets.

## TDD and checkpoints

For each correction:

1. write the focused failing test;
2. run it and confirm the intended failure;
3. implement the smallest coherent fix;
4. run focused and related tests;
5. commit the coherent unit.

Update this task's `state.md` only at meaningful boundaries. Create `result.md` only after all gates pass. Mark correction 1 state/result as superseded without rewriting historical claims.

## Completion gates

Run and record:

- focused regression tests;
- `npm test`;
- `npm run verify`;
- `git diff --check`;
- full task-owned diff review;
- clean synchronized branch state;
- PR #4 head/status and configured checks.

Update PR #4 body with the final behavior and evidence. Confirm no real canonical apply ran and no other repository changed. Finish at `READY_FOR_HUMAN_MERGE`, then stop for Sol review and human merge.
