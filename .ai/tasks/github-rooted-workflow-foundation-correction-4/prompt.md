# Luna execution contract: workflow foundation correction 4

You are Luna xhigh. Do not use subagents.

## Repository contract

Work only in:
`/Users/mihaildovgun/Desktop/WORK/workflows/ai/ai-workflow`

Repository: `syllik/ai-workflow`  
Branch: `task/github-rooted-agent-architecture`  
Existing PR: `https://github.com/syllik/ai-workflow/pull/4` into `master`  
Pre-correction-4 head: `0aafd7e896e874ca18ca732b74a52a370b26931c`

The immutable correction-4 handoff commit supplied by the launcher is
authoritative.

Before reading implementation files:

1. Run `git status --short --branch`, `git worktree list`, and `git remote -v`.
2. Safe-stop on uncommitted work, collision, wrong repository/branch, or
   unexpected remote.
3. Run `git fetch origin`.
4. Fast-forward only with
   `git merge --ff-only origin/task/github-rooted-agent-architecture`.
5. Verify `git rev-parse HEAD` equals the launcher SHA. Never reset, rebase,
   stash, force-push, or discard work.

Read this file and:
`.ai/tasks/github-rooted-workflow-foundation-correction-4/state.md`

Never read any `plan.md`; plans are Russian and human-only. Read only relevant
English workflow files, source, tests, and correction-3 result when necessary.

## Goal

Make the approved new-project workflow converge: after a committed valid
`workspace.yaml` change, one safe `apply` must regenerate the central
`projects/index.md`, perform the already-supported target operations, and leave
`check` and a second `plan` clean.

## Confirmed defect

At pre-correction head, `checkGeneratedFiles` reports `GENERATED_DRIFT` when
`projects/index.md` differs from `renderProjectIndex(manifest)`, but
`planWorkspace` emits only target clone/contract operations. CLI has no other
generation path. A valid new manifest record therefore cannot converge through
the documented generator flow.

## Required implementation

### 1. Add a narrowly typed central generated-file operation

- Extend the operation model with one explicit generated-file replacement kind.
- It may target only the exact central `projects/index.md` belonging to the
  manifest checkout; it must not become a generic overwrite primitive.
- Missing index creation may use the same strict kind or the existing
  create-file kind, but must obey the same identity and content checks.
- Desired content must be exactly `renderProjectIndex(manifest)`.
- Preserve deterministic UTF-8/LF output and existing budgets.

### 2. Prove central repository identity and containment

Before planning or applying this operation:

- derive `manifestRoot` from the resolved manifest path;
- identify the exact `syllik/ai-workflow` managed manifest record;
- require `manifestRoot` to resolve to that record's expected path inside the
  trusted workspace root;
- verify the repository Git root and expected origin with existing safety
  rules;
- reject descendant symlinks and any lexical or real-path escape;
- if generated drift exists but this identity cannot be proven, return a stable
  blocking finding and perform no writes.

Do not weaken the correction-3 clean-repository rule. The input manifest change
must already be committed before canonical `apply` begins.

### 3. Revalidate the operation immediately before mutation

- Recheck exact destination, central repository identity, clean/safe worktree,
  original fingerprint, operation kind, and exact renderer output before write.
- A forged path, forged content, changed file, dirty repository, or unsafe path
  must block all operations before mutation.
- Use atomic file replacement where practical; never delete, truncate on failed
  validation, or write another generated path.

### 4. Preserve one-invocation convergence

- Register the successful generated index write in the existing private,
  same-process generated-output fingerprint mechanism.
- Internal re-plan may tolerate only that exact path and content from the same
  `apply` invocation.
- The allowance must not cross processes and must not permit pre-existing or
  user-created dirty content.
- After successful `apply`, `checkGeneratedFiles` must return no index drift and
  the second `planWorkspace` must return zero operations/findings.

### 5. Add focused regression coverage

Use isolated fixtures and local clone sources. Add tests proving:

- adding one valid approved project record with a stale index produces the
  central index operation plus normal target operations;
- one `apply` writes the exact rendered index and converges; a second plan is a
  no-op and `check` is clean;
- missing central index is safely created and converges;
- stale index between plan and apply blocks before any operation is applied;
- forged destination or content cannot overwrite any file;
- dirty central checkout, wrong origin/path mapping, manifest root outside the
  declared checkout, and intermediate/final symlinks block without writes;
- a read-only project is never written;
- existing clone/scaffold and correction-3 safety regressions remain green.

Update documentation only if the exact `apply` behavior or precondition must be
made explicit. Do not add a separate generator command unless the integrated
safe `apply` design is proven impossible; stop and report before changing that
architecture.

## Scope and safety

- Modify only `syllik/ai-workflow`.
- Expected code areas: `scripts/workspace/operations.mjs`, related tests, and
  narrowly necessary CLI/docs updates.
- Do not change dependencies, lockfiles, approved project records, routing
  architecture, or unrelated code.
- Never write to `ChipIn-one/chipin-backend` or excluded repositories.
- Do not run real apply against `/Users/mihaildovgun/Desktop/WORK`.
- Keep the same branch and PR #4; do not create another PR.
- Never push to `master`, merge, enable auto-merge, force-push, or delete
  branches.

## TDD and checkpoints

Write focused failing tests first, confirm the intended failures, implement the
smallest bounded change, and rerun focused tests. Commit coherent units. Keep
`state.md` concise and current; create `result.md` only after every gate passes.

## Completion gates

Run and record:

- focused new-project/index convergence and safety tests;
- all related operations and CLI tests;
- `npm test`;
- `npm run verify`;
- `git diff --check`;
- complete task-owned diff review and cross-file integration pass;
- clean synchronized branch state;
- PR #4 head/status and configured remote checks.

Confirm no real canonical apply ran and no other repository changed. Update PR
#4 only. Finish at `READY_FOR_HUMAN_MERGE`, then stop for Sol review and human
merge.

## Bounded failure diagnosis

For a failed gate, inspect the failure and task-local context, make one obvious
task-local correction, rerun the specific check, then stop and report instead
of broad research or speculative debugging.

## Definition of done

The manifest-derived central index participates safely in integrated apply,
the documented new-project flow converges in one invocation in isolated tests,
all safety and verification gates pass, and PR #4 remains open for human merge.
