# Documentation contract

Same change: if behavior, UI, UX, commands, contracts, or workflow change, update the canonical user docs named by the target `.ai/context.md` / `AGENTS.md` in the same revision.

Otherwise the v2 handoff sets `approval.documentationDelta: none` and `approval.documentationDeltaReason` to exactly one of `docs-not-behavior` | `internal-only` | `generated-only`.

The user documentation contract in target `AGENTS.md` is `guides | product-spec | knowledge-base | workflow-policy`. Silence means same-change applies and emoji markers do not, unless the touched file already uses the YouTube guide style.

Semantic emoji map (use the closest meaning; do not decorate every bullet):

- 📚 index/docs hub
- 🧭 choose a path
- 🚀 getting started
- 🔐 config/secrets
- ▶️ run the workflow
- 🛠️ development
- 🧪 testing
- 🆘 troubleshooting
- 🛡️ security
- ❓ FAQ
- 📖 documentation rules
- ⚠️ constraints
- 📦 publish/release
- ✅ acceptance/recommended order

These are not user guides: `AGENTS.md`, role/workflow files, `.ai/context.md`, `PRODUCT.md`, `DECISIONS.md`, `docs/superpowers/**`, `docs/codex/**`. Do not add emoji headings there.

Do not create extra documentation files; update the canonical ones.
