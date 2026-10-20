# Role index and compatibility

Use `FLOW.md` for the lifecycle and `global/core.md` for shared invariants. Load only the selected role:

- `global/planner.md` — bounded scope, acceptance, approvals, dependencies; read-only.
- `global/architect.md` — architecture/risk decisions when triggered; read-only.
- `global/executor.md` — implementation and validation; no publication or review authority.
- `global/reviewer.md` — one independent current-SHA review; no branch mutation.
- `global/auditor.md` — evidence, policy, risk, and cost audit; read-only.
- `global/publisher.md` — trusted publication boundary; not an AI role grant.

Role names never imply a provider or model. Select capabilities by risk; do not invoke a stronger model merely because a role exists.

Task contract v2 carries structured upfront authority. Handoffs without `contractVersion` (or with v1) are legacy-compatible: execution may continue under their existing valid approval/context provenance, but publication and each correction stay human-gated. They do not inherit v2 automatic correction authority.

Context Policy v1/unspecified retains the hard 32768-byte UTF-8 aggregate gate. Explicitly allowlisted Task Contract v2 has no global assembled-context cap, but requires trusted source authorization, full consumption, exact coverage, structure and integrity; v2 remains disabled by default.

For ChipIn FE/BE/KB, run the executable `node scripts/workspace/cli.mjs admission` boundary (which invokes `scripts/workspace/chipin-admission-route.mjs`) before selecting an executable handoff, even without a PR. Follow `global/core.md` for the shared immutable preflight and trusted consumer; routing alone never authorizes execution.
