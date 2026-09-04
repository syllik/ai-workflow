# Luna execution contract: workflow foundation correction 3

You are Luna xhigh. Do not use subagents.

## Repository contract

Work only in:
`/Users/mihaildovgun/Desktop/WORK/workflows/ai/ai-workflow`

Repository: `syllik/ai-workflow`  
Branch: `task/github-rooted-agent-architecture`  
Existing PR: `https://github.com/syllik/ai-workflow/pull/4` into `master`  
Pre-correction-3 head: `fcbe029223b0e77d60b1c92918ff99c4170b0958`

The immutable correction-3 handoff commit is supplied by the launcher and is authoritative.

Before reading implementation files:

1. Run `git status --short --branch`, `git worktree list`, and `git remote -v`.
2. Safe-stop on uncommitted work, collision, wrong repository/branch, or unexpected remote.
3. Run `git fetch origin`.
4. Fast-forward only to the launcher-pinned handoff using `git merge --ff-only origin/task/github-rooted-agent-architecture`.
5. Verify `git rev-parse HEAD` equals the launcher SHA. Never reset, rebase, stash, force-push, or discard work.

Read this file and:
`.ai/tasks/github-rooted-workflow-foundation-correction-3/state.md`

Never read any `plan.md`; plans are Russian and human-only. Read only relevant English workflow files, source, tests, generated outputs, and earlier correction state/result when needed.

## Goal

Fix five independently reproduced Phase 1A defects in the existing branch and PR without changing the approved architecture.

## Required corrections

### 1. Never hide pre-existing uncommitted work

Current `planWorkspace` always permits untracked `AGENTS.md`, configured context, and `.ai/decisions.md`. A pre-existing untracked `AGENTS.md` therefore produces no dirty finding and is scheduled for mutation.

Required behavior:

- initial `plan` and `apply` require a completely clean repository, including every tracked and untracked path;
- remove the unconditional project-level `allowedUntrackedPaths(project)` allowance;
- files created by the current bounded apply invocation may be tolerated only during its internal convergence verification;
- that temporary allowance must contain exact task-owned paths and expected content fingerprints derived from successful operations in the same process;
- a path name alone is insufficient;
- the allowance must never cross invocations or permit user-created content;
- any mismatch produces `DIRTY_REPOSITORY` or first-drift failure before further writes.

Add regression tests proving:
- pre-existing untracked `AGENTS.md`, context, and decisions each block with zero applied operations and remain byte-identical;
- tracked modifications still block;
- the existing one-invocation clone/scaffold flow still converges by recognizing only its own exact outputs.

### 2. Enforce real filesystem containment

Current `resolveInside` is lexical. An intermediate symlink such as `<root>/linked -> <outside>` allows a clone plan for `linked/repository`, which would write outside the workspace.

Use one explicit path-safety boundary for plan, preflight, check, and artifact collection:

- resolve the workspace root to a trusted real path;
- reject symlinks in every existing descendant segment from root to repository or artifact;
- for a missing destination, inspect each existing ancestor and prove its real path remains under the real root;
- for an existing destination, prove its real path remains under the real root;
- reject a symlink at the final repository/file path;
- repeat containment immediately before each clone, create, and managed-block replacement;
- never follow a workspace descendant symlink for reads or writes.

Prefer rejecting all descendant symlinks rather than supporting ambiguous links. Add fixture tests for intermediate symlink escapes during clone, existing-repository planning, generated file writes, and budget collection. Assert blocking findings and that the outside directory remains unchanged.

### 3. Validate and update the central generated AGENTS block

`renderAgentsBlock` now emits absolute GitHub URLs, but checked-in root `AGENTS.md` still contains the old relative block. Also, `node scripts/workspace/cli.mjs check` returns success because its default checkout root does not contain `workflows/ai/ai-workflow` below itself.

Required behavior:

- regenerate the current root `AGENTS.md` managed block from `renderAgentsBlock(workspaceManifest)`;
- preserve all content outside the exact managed markers;
- validate the central checkout's managed AGENTS block relative to the manifest directory, independently of whether a canonical workspace root was supplied;
- avoid duplicate findings when manifest checkout and canonical target resolve to the same repository;
- missing, malformed, duplicate, or stale central routing blocks must fail `workspace check`;
- `npm run verify` from the `ai-workflow` checkout must exercise this check.

Add a test that a correct central block passes, a stale relative block fails with `GENERATED_DRIFT`, and restoring renderer output passes.

### 4. Make every reusable agent artifact English and plan-independent

`prompts/implementation.md` says Luna never reads `plan.md` but later tells it to use the “approved plan”; it and several reusable prompts/templates remain Russian.

Preserve behavior while converting agent-executable reusable content to English:

- all Markdown under `prompts/`;
- agent/durable templates under `templates/`, including prompt, task context, decision, and result templates;
- `AI.md`, `FLOW.md`, `AGENTS.md`, and `global/*.md` remain English.

The user-facing README may remain Russian or bilingual. Task `plan.md` files remain Russian and are excluded from the English-only scan. Luna must use self-contained `prompt.md`, current `state.md`, repository state, and task-owned diff; it must never read or rely on a human plan.

Update workflow tests to:

- reject Cyrillic in the enumerated reusable agent files/directories;
- reject positive instructions containing `plan.md`, “approved plan”, “human plan”, or equivalent read/use language;
- permit explicit negative statements such as “Luna never reads plan.md”.

Do not translate or read historical task plan files.

### 5. Close the context-path budget bypass

Current validation accepts any safe managed `contextPath`, while budget resolution recognizes only `.ai/context.md`. A valid `docs/context.md` can therefore exceed 8 KB without a finding.

The approved contract fixes the path. Require:

- managed project: `contextPath` exactly `.ai/context.md`;
- read-only project: `contextPath` absent;
- any other managed value returns a stable validation finding and prevents plan/apply;
- standard context still receives the 8 KB UTF-8 budget in plan and check.

Add tests reproducing rejection of `docs/context.md`, acceptance of the exact path, and `BUDGET_EXCEEDED` for an oversized exact-path context.

## Scope and safety

- No dependency, lockfile, project-list, public architecture, or unrelated refactor changes.
- Modify only `syllik/ai-workflow`.
- Never write to `ChipIn-one/chipin-backend` or excluded repositories.
- Do not run real apply against `/Users/mihaildovgun/Desktop/WORK`.
- Preserve unrelated work and legacy storage.
- Keep the same branch and PR #4; do not create another PR.
- Never push to `master`, merge, enable auto-merge, force-push, or delete branches.
- Maintain all existing UTF-8 budgets.

## TDD and checkpoints

For each defect: write the focused failing test, confirm the intended failure, implement the smallest fix, rerun focused/related tests, and commit one coherent unit.

Update this task's `state.md` only at meaningful boundaries. Create `result.md` only after all gates pass. Mark Correction 2 state/result as superseded without rewriting historical evidence.

## Completion gates

Run and record:

- all focused regression tests;
- `npm test`;
- `npm run verify`;
- `git diff --check`;
- full task-owned diff review;
- clean synchronized branch state;
- PR #4 head/status and configured remote checks.

Confirm no real canonical apply ran and no other repository changed. Update PR #4 only. Finish at `READY_FOR_HUMAN_MERGE`, then stop for Sol review and human merge.
