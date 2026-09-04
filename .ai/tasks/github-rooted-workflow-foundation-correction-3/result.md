# Correction 3 result

## Done

Implemented all five correction-3 defects in syllik/ai-workflow:

- pre-existing tracked and untracked repository changes block plan and apply;
  same-process convergence accepts only immutable, fingerprinted outputs from
  successful operations;
- plan, preflight, check, and artifact collection reject descendant symlinks
  and enforce real-path containment;
- the central AGENTS managed block is generated and checked from the manifest
  directory, with duplicate findings suppressed;
- reusable prompts and templates are English and self-contained; human-only
  plans remain excluded from Luna execution;
- managed projects require contextPath .ai/context.md, and the exact context
  receives its UTF-8 budget.

## Changed files

Workflow scripts, focused regression tests, root AGENTS.md, reusable prompts
and templates, and the correction-3 state/result files.

## Checks

- npm test — 52 tests passed.
- npm run verify — passed, including manifest-only check, checkout-root
  generated-file check, and git diff --check.
- Focused red/green tests cover dirty repositories, exact output fingerprints,
  symlink clone/existing/write/budget escapes, central routing and deduplication,
  English reusable content, human-plan instructions, and context-path validation.
- PR #4 head verified at b9c6958; it remains open against master.
- No real canonical workspace apply ran. No other repository was changed.

## Remaining issues

None. Stop for Sol review and human merge.

## Context updates

The correction-3 state is READY_FOR_HUMAN_MERGE.
