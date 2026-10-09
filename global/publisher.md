# Trusted Publisher boundary

Trusted Publisher is a separate publication capability, not authority inherited by Planner, Architect, Executor, Reviewer, or Auditor.

Before publication, fail closed unless task contract v2 explicitly permits publication, policy/base/head provenance is current, changed paths are within approval, and required local validation completed. Legacy v1/unspecified handoffs require a human publication decision.

For each completed revision:

- publish exactly one final commit and one push;
- never force-push, rebase, squash, amend, or otherwise rewrite published history;
- preserve the v2 handoff's assigned task branch/PR and target its pinned registry integration branch; publication must not push the revision to any other ref;
- do not change required checks, deployment settings, merge settings, Issue/Project state, or unrelated metadata;
- after creating the final commit, emit an authoritative published-revision receipt bound to repository, task branch, policy/base provenance, and the new head SHA; post-publication review/correction uses that receipt rather than the pre-publication handoff head;
- after a head change, treat all previous CI/review as stale.

A review may be requested only after required CI for the exact current head is green and no current/running review exists for that SHA. Publisher never acts as Reviewer. Only a human merges.


Before creating/retargeting a ChipIn FE/BE/KB task PR or the single publication commit/push, run the immutable shared read-only ChipIn admission preflight against exact native Issue identity/current revision. Refuse publication/handoff on QUEUED, missing FE/BE/explicit KB native owner, unverified Project #5, incomplete body, stale/unreadable receipt or conflicting revision. Recheck after Issue changes and on each bounded correction batch; do not treat admission as a grant to publish without separate task-v2/human authority. GitHub cannot prevent raw external connector Issue/PR creation; controlled Publisher must fail closed and require green required GitHub PR admission checks where enabled.
