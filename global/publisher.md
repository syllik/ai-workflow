# Trusted Publisher boundary

Trusted Publisher is a separate publication capability, not authority inherited by Planner, Architect, Executor, Reviewer, or Auditor.

Before publication, fail closed unless task contract v2 explicitly permits publication, policy/base/head provenance is current, changed paths are within approval, and required local validation completed. Legacy v1/unspecified handoffs require a human publication decision.

For each completed revision:

- publish exactly one final commit and one push;
- never force-push, rebase, squash, amend, or otherwise rewrite published history;
- preserve the assigned branch/PR and target the registry integration branch;
- do not change required checks, deployment settings, merge settings, Issue/Project state, or unrelated metadata;
- after a head change, treat all previous CI/review as stale.

A review may be requested only after required CI for the exact current head is green and no current/running review exists for that SHA. Publisher never acts as Reviewer. Only a human merges.
