# Git lifecycle and branch migration

Baseline refreshed: 2026-09-28 UTC. This document records the policy and the bounded six-repository migration inventory for `syllik/ai-workflow#23`, including the completed knowledge-base and organization cutovers. It does not claim global completion.

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
| `syllik/syllik` | managed | `master` | `master` | none | canonical | no open PRs; `.github/workflows/profile-ci.yml` targets `master`; active `master protect` ruleset |
| `syllik/ai-workflow` | managed | `master` | `master` | none | canonical | open PRs #29 and #31; `ci.yml` and `routing-rollout.yml` target `master`; active `master protect` ruleset |
| `ChipIn-one/.github` | managed | `master` | `master` | none | canonical | cut over at `796b98543ad963e7d18680f243027b6495515f05`; `main` retained for rollback; active `canonical branches protect` ruleset covers `main` + `master`; post-cutover `DEV readiness policy tests` push run on `master` succeeded |
| `ChipIn-one/chipin-knowledge-base` | read-only | `master` | `master` | none | canonical | cut over at `a0ea83721b47d153dbb4c45d4f8ec718bc899c4b`; `main` retained for rollback; open PR #7 retargeted to `master`; private-repository branch protection is not enforceable on the current organization plan |
| `ChipIn-one/chipin-frontend` | managed | `main` | `dev` | production | temporary-exception | PR #307 merged to `dev` at `c49502d5f1c623d4df505d77b6de874b19dcd40b` and moved read-only KB references to `master`; FE `dev -> main` topology remains unchanged |
| `ChipIn-one/chipin-backend` | read-only | `develop` | `develop` | production | migration | no open PRs; PR checks target `develop`; staging deploys pushes to `develop`; production is manual; no repository ruleset observed |

The frontend `dev -> main` ancestry gate is an intentional temporary exception. It must remain until a replacement promotion path can promote the exact tested commit without recreating divergence. This policy task therefore does not force squash-only topology onto FE branches.

Backend staging currently builds/deploys every qualifying push to `develop`. Production is `workflow_dispatch` and builds the selected workflow ref. That is not yet proof of an exact tested-`master` promotion path, so the backend remains a migration state.

Frontend deployment integration outside the observed repository Actions workflows was not verified here. Knowledge-base deployment/environment dependencies were not observed. Those are bounded checks before their branch migration, not assumptions.

## Repository settings diff

Observed on all six repositories: merge commits enabled, squash enabled, rebase enabled, automatic head-branch deletion disabled, and squash title mode `COMMIT_OR_PR_TITLE`.

| Repository | Reviewable settings delta |
| --- | --- |
| `syllik/syllik` | `allow_merge_commit: true -> false`; keep `allow_squash_merge: true`; `allow_rebase_merge: true -> false`; `delete_branch_on_merge: false -> true`; `squash_merge_commit_title: COMMIT_OR_PR_TITLE -> PR_TITLE` |
| `syllik/ai-workflow` | same delta |
| `ChipIn-one/.github` | same delta, after canonical branch migration is prepared |
| `ChipIn-one/chipin-knowledge-base` | same delta, only under separate write authorization |
| `ChipIn-one/chipin-frontend` | defer merge-method restriction until the `dev -> main` promotion replacement is ready; then apply the same canonical delta |
| `ChipIn-one/chipin-backend` | same delta, only under separate write authorization and after deploy branch references are migrated |

No settings change is applied by PR #29.

## Rulesets and migration consumers

Current ruleset evidence:

- `syllik/syllik`: `master protect` blocks deletion/non-fast-forward, requires resolved review threads and green `profile-ci`, but currently allows merge/squash/rebase.
- `syllik/ai-workflow`: `master protect` blocks deletion/non-fast-forward, requires resolved review threads and green `verify`, but currently allows merge/squash/rebase.
- `ChipIn-one/.github`: active `canonical branches protect` targets both `main` and `master`, blocks deletion/non-fast-forward, requires resolved review threads, green strict `evaluate-fixtures`, linear history, and allows only squash merges; no bypass actors are configured.
- `ChipIn-one/chipin-frontend`: no Copilot review ruleset is present. The active repository ruleset `main` targets only `main` and currently permits merge commits there; `dev` is separately protected with required `frontend-ci`.
- `ChipIn-one/chipin-knowledge-base`: `master` is the live default branch, but GitHub reports it unprotected. On the current plan, rulesets for this private organization repository are not enforced; the owner does not currently plan a GitHub Team upgrade. This is an explicit platform limitation recorded on #23, not evidence of protection.
- Backend had no repository ruleset in the refreshed read.

Before each migration, update every consumer of the old branch atomically with the branch/default/ruleset change: open PR bases, Actions branch filters, deploy source restrictions, badges/docs, automation refs, and environment source policies. Preserve FE and BE processes separately; only the KB contract is shared.

## 2026-09-28 cutover receipt

- Knowledge base: PR `ChipIn-one/chipin-knowledge-base#14` merged; `master` was created at the exact resulting `main` SHA `a0ea83721b47d153dbb4c45d4f8ec718bc899c4b`; default switched to `master`; `main` retained; PR #7 retargeted to `master`. Protection is not enforceable for this private organization repository on the current plan, so no protection claim is made.
- Organization coordination repo: PR `ChipIn-one/.github#21` merged; `master` was created at exact merge SHA `796b98543ad963e7d18680f243027b6495515f05`; active ruleset `canonical branches protect` covers `main` and `master`, requires strict `evaluate-fixtures`, resolved review threads and linear history, permits only squash, blocks deletion/non-fast-forward, and has no bypass actors; default switched to `master`; post-cutover push CI on `master` succeeded.
- Frontend consumer: `ChipIn-one/chipin-frontend#307` merged to `dev` at `c49502d5f1c623d4df505d77b6de874b19dcd40b`; read-only KB references now use `master`. The FE `dev -> main` production topology remains a documented temporary exception and was not migrated.
- Backend remains owner-owned on `develop`; no backend code, CI, deployment, PR, or branch state was mutated by this cutover.
- Central PR #44 records the resulting registry state. Concurrent PR #31 remains separate and open; its Deep Dark Factory registration is not copied into this cutover PR.

## Promotion and cleanup safety

A production promotion records the exact commit SHA/tag that passed the intended checks. Staging and production environments consume that immutable source. Do not maintain mutable `staging` or `production` source branches solely to model environments.

After a human merge, cleanup is conservative:

1. Confirm the PR is merged and the intended commit exists on the canonical branch.
2. Use `git fetch --prune` (or equivalent) to refresh remote-tracking state.
3. Delete a local temporary branch only when it is clean, clearly merged, and no longer needed.
4. Never delete a protected, dirty, unmerged, release/integration, or ambiguous branch.
5. No force-push is part of the lifecycle policy.

## Coordination and bounded follow-ups

`ChipIn-one/.github#15` is open and proposes moving the canonical AI workflow into the organization. This task does not change canonical location. If #15 proceeds, the lifecycle contract, validator, generated index, and this policy must exist at the new canonical location before ChipIn consumers switch.

PR #31 in this repository registers Deep Dark Factory and touches the shared manifest/index. Deep Dark Factory is excluded from this audit. Whichever PR lands second must refresh against the first and regenerate the index without inventing lifecycle state for the excluded repository.

Bounded follow-ups are: replace FE `dev -> main` with exact-commit promotion before FE branch migration; migrate BE deploy/PR filters from `develop` only with deploy verification; apply the remaining repository-level merge-setting deltas where supported; and activate/verify KB branch protection if the organization plan later supports enforcement for private repositories. The `.github` and KB default/integration branch cutovers are complete; KB protection remains the documented plan-limited exception.

`syllik/codex-local-runner`, Deep Dark Factory, and every other repository outside the six-row inventory are intentionally unverified by this task.
