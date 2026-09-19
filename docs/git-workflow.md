# Git history and deployment lifecycle

This policy is canonical for repositories registered in `workspace.yaml`. Repository-local instructions may narrow it, but they must not silently invent a different branch or deployment model.

## Canonical history model

Normal managed repositories use:

```text
feature/* -> pull request -> squash merge -> master
```

`master` is the canonical long-lived code branch. Only a human performs the final merge.

A normal feature, fix, maintenance, or documentation PR contributes exactly one commit to its target branch. Use GitHub **Squash and merge**. The squash commit subject is the PR title and follows:

```text
<type>(<optional-scope>): <imperative summary>
```

Use a conventional type such as `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build`, `perf`, or `revert`. Keep issue links and detailed evidence in the PR body rather than forcing them into the commit subject.

Repository settings should allow squash merge, disable ordinary merge commits and rebase merge for normal PR completion, require linear history on protected long-lived branches where supported, and enable GitHub's **Automatically delete head branches** setting.

After merge, local cleanup is:

```text
git fetch --prune
git branch -d <merged-branch>
```

Never force-delete a protected, long-lived, unmerged, dirty, or otherwise ambiguous branch.

## Lifecycle profiles

Every workspace record declares `lifecycle`.

### code-only

For libraries, documentation, guides, workflow/config repositories, local tools, and other repositories without a persistent deployment target.

```text
feature/* -> master
```

No staging or production environment is required.

### staging

For software with a shared pre-production deployment but no production deployment managed by this workflow.

```text
feature/* -> master -> staging environment
```

### production

For deployable applications or services with pre-production validation and production release.

```text
feature/* -> master -> staging environment -> production environment
```

Production promotes an approved immutable commit or tag originating from `master`. Deployment secrets, approvals, and protection rules remain environment-scoped.

`staging` and `production` are GitHub Environments, not mandatory long-lived branches.

## Branch state

Every workspace record also declares `branchState`.

- `canonical`: managed repository already uses `master` as its integration branch.
- `migration`: managed repository still uses a legacy/non-canonical branch model. This is temporary and must stay visible in generated workspace output until migrated.
- `external`: read-only repository whose branch naming is controlled outside this workflow. Record the real external branch; do not rename it merely for symmetry.
- `integration-exception`: managed deployable repository has a documented, durable need for a long-lived integration branch before `master`. It must declare `releaseBranch: master`.

A managed repository must not be marked `canonical` while its integration branch is `main`, `dev`, `develop`, or another branch. Do not hide migration debt by changing metadata without changing the repository.

## Integration-branch exception

A durable integration branch is exceptional and is valid only when multiple changes genuinely need to be batched before promotion to `master`.

```text
feature/* -> integration branch -> master -> deployment environments
```

The exception must be explicit in `workspace.yaml`; agents never invent it from existing branch names.

## Repository migration safety

Branch normalization is a repository migration, not a global search-and-replace. For each managed repository moving to the canonical model:

1. inventory open PR bases, CI/CD triggers, rulesets/branch protections, deployment source restrictions, badges, automation, and external integrations;
2. create or rename the canonical branch without losing history;
3. update the default branch and all protected-branch/ruleset references;
4. update CI/CD and environment source restrictions before removing the old branch;
5. update repository documentation and `workspace.yaml`;
6. verify open PRs and deployment workflows still target the intended branch;
7. remove the old long-lived branch only after the migration is proven safe.

If the repository cannot be migrated in the same bounded change, keep `branchState: migration` and record its current branch model truthfully.

## Deployment promotion

Do not create `staging` or `production` branches merely to mirror environment names. A production-capable repository should use GitHub Environments/protected deployment rules where practical and promote the tested immutable SHA/tag rather than copying source history into another mutable branch.

Repositories with `lifecycle: code-only` must not receive empty staging/production infrastructure for consistency.

## Agent boundary

Agents may prepare branches, commits, pull requests, validation evidence, and migration plans only within their granted authority. Final merge remains human-only. Repository settings, protected-branch changes, environment changes, or default-branch migrations require an explicitly authorized operation and must preserve current CI/deployment behavior.
