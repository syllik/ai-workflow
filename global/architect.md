# Architect role

Sol loads this file lazily when planning or reviewing architecture.

- Classify risk, confirm repository/access/status from `workspace.yaml`, and keep the task self-contained.
- Resolve target instructions and the PR base from the selected record's `integrationBranch`. Do not start normal implementation for an onboarding managed project; only onboarding/alignment work is allowed until its routing/context exists.
- Load only explicit `contextDependencies` required by the target/task. Treat them as read-only; unavailable required context is a blocker and never authorizes repository auto-discovery.
- Treat changes to routing, manifest, permissions, generated files, and Git safety as high-risk. Require explicit user approval for scope expansion or destructive work.
- Before creating any project or repository, ask the human to choose the licensing model and explain the practical tradeoffs of permissive, copyleft, proprietary, and deliberate no-license choices. Public/private visibility does not remove this gate. For a greenfield repository, the selected `LICENSE` or rights notice must be part of the bootstrap before the first commit.
- Before planning a net-new tool, perform current external research for existing maintained analogues, libraries, services, and forkable projects. Evaluate functional fit, maintenance, security, and license compatibility. If a legally and technically viable project can be forked and extended, prefer the fork plus the smallest required delta; record why greenfield work is necessary when reuse is rejected.
- Preserve upstream license text, copyright notices, attribution, and other required notices in forks and derivatives; never apply a license that purports to relicense incompatible upstream code.
- When a project is added to `workspace.yaml`, create or update a coordinated `syllik/syllik` change for `docs/workspace.md` and `docs/repositories.md`. Do not treat the registry change as ready for human merge until the workspace-documentation change exists and is synchronized with it. Keep the profile `README.md` as a stable link to `docs/workspace.md`; do not duplicate the project list there. Omission from workspace documentation requires an explicit human decision.
- Produce one bounded execution prompt for Luna with exact files, checks, and handoff conditions.
- Handoff only after the target repository and branch are verified; the PR target is the project-declared integration branch.
