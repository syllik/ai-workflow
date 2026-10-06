# Git lifecycle and branch migration

Baseline refreshed: 2026-10-04 UTC for the completed canonical settings and organization cleanup receipts. The six-repository migration inventory remains bounded to `syllik/ai-workflow#23`; FE and BE migration state is not re-audited by this receipt, and this document does not claim global completion.

## Canonical model

```text
<type>/issue-<number>-<slug>
  -> pull request
  -> human squash merge
  -> master
  -> optional staging environment
  -> optional production environment
```

`master` is the target canonical long-lived source branch. Normal feature/fix PRs squash into it and use the final PR title as the squash commit subject. `none`, `staging`, and `production` are deployment profiles; `staging` and `production` are environment targets, not long-lived source branches. Production promotion must select an exact tested commit or tag originating from `master`, not a mutable environment branch.

Temporary issue branches use `<type>/issue-<number>-<slug>` (for example `fix/issue-123-token-refresh`). A repository-specific integration topology may survive temporarily only as an explicit `temporary-exception` in `workspace.yaml` with a reason and bounded follow-up.

## Audited repository state

| Repository | Access in registry | Current default | Current integration | Deployment profile | State | PR / CI / automation consumers |
| --- | --- | --- | --- | --- | --- | --- |
| `syllik/syllik` | managed | `master` | `master` | none | canonical | canonical repository merge settings are live; `.github/workflows/profile-ci.yml` targets `master`; active `master protect` is squash-only, requires linear history, resolved review threads and green `profile-ci` |
| `syllik/ai-workflow` | managed | `master` | `master` | none | canonical | canonical repository merge settings are live; `ci.yml` and `routing-rollout.yml` target `master`; active `master protect` is squash-only with linear history and required `verify` |
| `ChipIn-one/.github` | managed | `master` | `master` | none | canonical | canonical repository merge settings are live; `main` is retained as an unprotected rollback ref; active `canonical branches protect` targets `master`; PR #35 removed the temporary `main` readiness triggers and post-merge `evaluate-fixtures` on `master@871823ba72eaa5f2871afc17164d348af57e7feb` succeeded |
| `ChipIn-one/chipin-knowledge-base` | read-only | `master` | `master` | none | canonical | canonical repository merge settings are live; cut over at `a0ea83721b47d153dbb4c45d4f8ec718bc899c4b`; `main` retained for rollback; PR #7 retargeted to `master`; private-repository branch protection is not enforceable on the current organization plan |
| `ChipIn-one/chipin-frontend` | managed | `main` | `dev` | production | temporary-exception | PR #307 merged to `dev` at `c49502d5f1c623d4df505d77b6de874b19dcd40b` and moved read-only KB references to `master`; FE `dev -> main` topology remains unchanged |
| `ChipIn-one/chipin-backend` | read-only | `develop` | `develop` | production | migration | PR checks target `develop`; staging deploys pushes to `develop`; production is manual; no repository ruleset observed |

The frontend `dev -> main` ancestry gate is an intentional temporary exception. It must remain until a replacement promotion path can promote the exact tested commit without recreating divergence. This policy task therefore does not force squash-only topology onto FE branches.

Backend staging currently builds/deploys every qualifying push to `develop`. Production is `workflow_dispatch` and builds the selected workflow ref. That is not yet proof of an exact tested-`master` promotion path, so the backend remains a migration state.

Frontend deployment integration outside the observed repository Actions workflows was not verified here. Knowledge-base deployment/environment dependencies were not observed. Those are bounded checks before their branch migration, not assumptions.

## Repository settings diff

The 2026-09-27/28 audit observed merge commits and rebase enabled, automatic head-branch deletion disabled, and squash title mode `COMMIT_OR_PR_TITLE` across the bounded set. On 2026-10-04, the supported canonical repositories below were re-read after the human settings change.

| Repository | Reviewable settings delta |
| --- | --- |
| `syllik/syllik` | applied and verified: merge commits OFF, squash ON, rebase OFF, automatic head-branch deletion ON, squash title `PR_TITLE`, auto-merge OFF |
| `syllik/ai-workflow` | applied and verified with the same canonical settings |
| `ChipIn-one/.github` | applied and verified with the same canonical settings |
| `ChipIn-one/chipin-knowledge-base` | applied and verified with the same canonical repository merge settings; branch-protection enforcement remains plan-limited |
| `ChipIn-one/chipin-frontend` | defer merge-method restriction until the `dev -> main` promotion replacement is ready; then apply the same canonical delta |
| `ChipIn-one/chipin-backend` | same delta, only under separate write authorization and after deploy branch references are migrated |

PR #29 itself did not mutate repository settings. The canonical settings above were applied later by the human owner and verified live on 2026-10-04.

## Rulesets and migration consumers

Current ruleset evidence:

- `syllik/syllik`: `master protect` blocks deletion/non-fast-forward, requires resolved review threads and green `profile-ci`, requires linear history, and allows only squash merges; no bypass actors are configured.
- `syllik/ai-workflow`: `master protect` blocks deletion/non-fast-forward, requires resolved review threads and green `verify`, requires linear history, and allows only squash merges; no bypass actors are configured.
- `ChipIn-one/.github`: active `canonical branches protect` targets only `master`, blocks deletion/non-fast-forward, requires resolved review threads, green strict `evaluate-fixtures`, linear history, and allows only squash merges; no bypass actors are configured. The legacy `main` ref is retained temporarily for rollback but is no longer part of the protected canonical path.
- `ChipIn-one/chipin-frontend`: no Copilot review ruleset is present. The active repository ruleset `main` targets only `main` and currently permits merge commits there; `dev` is separately protected with required `frontend-ci`.
- `ChipIn-one/chipin-knowledge-base`: `master` is the live default branch, but GitHub reports it unprotected. On the current plan, rulesets for this private organization repository are not enforced; the owner does not currently plan a GitHub Team upgrade. This is an explicit platform limitation recorded on #23, not evidence of protection.
- Backend had no repository ruleset in the refreshed read.

Before each migration, update every consumer of the old branch atomically with the branch/default/ruleset change: open PR bases, Actions branch filters, deploy source restrictions, badges/docs, automation refs, and environment source policies. Preserve FE and BE processes separately; only the KB contract is shared.

## 2026-09-28 cutover receipt

- Knowledge base: PR `ChipIn-one/chipin-knowledge-base#14` merged; `master` was created at the exact resulting `main` SHA `a0ea83721b47d153dbb4c45d4f8ec718bc899c4b`; default switched to `master`; `main` retained; PR #7 retargeted to `master`. Protection is not enforceable for this private organization repository on the current plan, so no protection claim is made.
- Organization coordination repo: PR `ChipIn-one/.github#21` completed the branch cutover; PR #35 later removed the temporary `main` branch filters from `DEV readiness policy tests`, leaving `pull_request` and `push` on `master` plus manual `workflow_dispatch`. The squash merge landed as `871823ba72eaa5f2871afc17164d348af57e7feb`, and post-merge `evaluate-fixtures` succeeded on that exact `master` head. The legacy `main` ref remains only as rollback state.
- Frontend consumer: `ChipIn-one/chipin-frontend#307` merged to `dev` at `c49502d5f1c623d4df505d77b6de874b19dcd40b`; read-only KB references now use `master`. The FE `dev -> main` production topology remains a documented temporary exception and was not migrated.
- Backend remains owner-owned on `develop`; no backend code, CI, deployment, PR, or branch state was mutated by this cutover.
- Central PR #44 records the resulting registry state. PR #31 is a separate Deep Dark Factory change and its registration is not copied into this cutover receipt.

## Promotion and cleanup safety

A production promotion records the exact commit SHA/tag that passed the intended checks. Staging and production environments consume that immutable source. Do not maintain mutable `staging` or `production` source branches solely to model environments.

After a human merge, cleanup is conservative:

1. Confirm the PR is merged and the intended commit exists on the canonical branch.
2. Use `git fetch --prune` (or equivalent) to refresh remote-tracking state.
3. Delete a local temporary branch only when it is clean, clearly merged, and no longer needed.
4. Never delete a protected, dirty, unmerged, release/integration, or ambiguous branch.
5. No force-push is part of the lifecycle policy.

## Coordination and bounded follow-ups

`ChipIn-one/.github#15` proposes moving the canonical AI workflow into the organization. This task does not change canonical location. If that proposal proceeds, the lifecycle contract, validator, generated index, and this policy must exist at the new canonical location before ChipIn consumers switch.

PR #31 in this repository registers Deep Dark Factory and touches the shared manifest/index. Deep Dark Factory is excluded from this audit. Whichever PR lands second must refresh against the first and regenerate the index without inventing lifecycle state for the excluded repository.

Bounded follow-ups are: replace FE `dev -> main` with exact-commit promotion before FE branch migration; migrate BE deploy/PR filters from `develop` only with deploy verification and owner coordination; apply their canonical merge-setting deltas only when those migrations are safe; and activate/verify KB branch protection if the organization plan later supports enforcement for private repositories. The supported canonical settings for `syllik/syllik`, `syllik/ai-workflow`, `ChipIn-one/.github`, and the KB repository-level merge options are complete; KB protection remains the documented plan-limited exception.

`syllik/codex-local-runner`, Deep Dark Factory, and every other repository outside the six-row inventory are intentionally unverified by this task.
