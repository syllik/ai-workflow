# GitHub-rooted Workflow Foundation — Implementation Plan

> **Для Luna xhigh:** выполнять задачи последовательно и без subagents. Этот файл предназначен для быстрого human review; исполняемые требования находятся в `prompt.md`.

**Цель:** создать в `syllik/ai-workflow` декларативную foundation: manifest, token budgets, безопасный generator/validator, новый bootstrap и локальный `.ai` contract.

**Архитектура:** `workspace.yaml` является единственным intended workspace mapping. Небольшой Node.js CLI загружает и проверяет manifest, строит deterministic Markdown/routing blocks, планирует безопасные локальные операции и применяет только clone/scaffold/update внутри managed regions. Project facts остаются в target repositories.

**Tech Stack:** Node.js 22.23.2, ESM, `node:test`, пакет `yaml`, Markdown, YAML.

**Spec:** `.ai/tasks/github-rooted-agent-architecture/plan.md`

## Global constraints

- Target repository: `syllik/ai-workflow`.
- Base branch: `master`; approved base SHA: `1c2d4831ff84aea7a4d63135dc2c2ff4952e4c46`.
- Authorized branch: `task/github-rooted-agent-architecture`.
- Не изменять другие repositories в Phase 1A.
- Не запускать реальный `workspace apply` против `~/Desktop/WORK`.
- Backend остаётся `read-only`; Tangem и остальные excluded repositories отсутствуют в manifest.
- Не удалять старое `projects/` в этой phase: пометить его как legacy и перестать загружать.
- Не хранить личную память, conversation dumps, secrets или credentials.
- Не использовать subagents.
- Не merge, не включать auto-merge и не push в `master`.
- Каждый implementation step начинается с failing test и заканчивается проверкой.
- Все executable agent files пишутся по-английски; этот plan остаётся по-русски.
- Hard budgets из spec обязательны и измеряются как UTF-8 bytes.

## Карта файлов

Создать:

- `workspace.yaml` — schema version, canonical root, budgets и восемь allowlisted projects.
- `package.json`, `package-lock.json` — Node 22.23.2 и воспроизводимые scripts.
- `scripts/workspace/manifest.mjs` — parse/normalize/schema validation.
- `scripts/workspace/budgets.mjs` — deterministic UTF-8 byte checks.
- `scripts/workspace/render.mjs` — pure render functions для project index и managed blocks.
- `scripts/workspace/operations.mjs` — safe plan и apply operations.
- `scripts/workspace/cli.mjs` — `check|plan|apply` command boundary.
- `test/fixtures/workspace/` — isolated repositories и collision fixtures.
- `test/manifest.test.mjs`, `budgets.test.mjs`, `render.test.mjs`, `operations.test.mjs`, `cli.test.mjs`.
- `global/core.md`, `global/architect.md`, `global/executor.md`.
- `projects/README.md` — legacy boundary.
- `.ai/context.md`, `.ai/decisions.md`.
- Pre-existing inputs: `.ai/tasks/github-rooted-workflow-foundation/{prompt,state}.md`.

Изменить:

- `FLOW.md` — GitHub-only lazy-loading bootstrap не более 2 KB.
- `AGENTS.md` — compact managed routing block плюс local repository rules.
- `README.md` — актуальная структура и команды.
- `projects/index.md` — generated compact route/status index.
- `.gitignore` — только реальные local/generated artifacts, без игнорирования canonical files.

`global/context.md` и `global/workflow.md` сократить до migration pointers без копии workflow.

---

### Task 1: Node foundation и canonical manifest

**Files:**

- Create: `package.json`
- Create: `package-lock.json`
- Create: `workspace.yaml`
- Create: `scripts/workspace/manifest.mjs`
- Create: `test/manifest.test.mjs`

**Interfaces:**

- Produces: `loadManifest(path): Promise<WorkspaceManifest>`
- Produces: `validateManifest(value): WorkspaceManifest`
- Produces normalized projects with `id`, `repository`, `localPath`, `group`, `access`, `status`, `contextPath`.

- [ ] **Step 1: добавить failing schema tests**

Покрыть valid manifest и rejection для duplicates, unsafe paths, unknown fields, invalid access/status и `read-only` с `contextPath`.

```js
test("rejects a managed active project without contextPath", () => {
  assert.throws(
    () => validateManifest(fixture({ access: "managed", status: "active", contextPath: null })),
    /contextPath/
  );
});

test("rejects duplicate normalized local paths", () => {
  assert.throws(() => validateManifest(duplicatePathFixture()), /duplicate localPath/);
});
```

- [ ] **Step 2: подтвердить RED**

Run: `node --test test/manifest.test.mjs`  
Expected: FAIL, потому что module/functions отсутствуют.

- [ ] **Step 3: создать minimal package и parser**

Использовать ESM, Node `22.23.2`, `node:test` и exact locked `yaml`. Reject unknown keys и unsafe/non-POSIX relative paths.

- [ ] **Step 4: заполнить manifest**

Включить семь `managed` repositories и backend `read-only`. Только `ai-workflow` получает `status: active` в Phase 1A; остальные writable projects — `onboarding`; backend — `active/read-only`. Не включать Tangem или `syllik.github.io`.

- [ ] **Step 5: подтвердить GREEN**

Run: `npm test -- --test-name-pattern="manifest"`  
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add package.json package-lock.json workspace.yaml scripts/workspace/manifest.mjs test/manifest.test.mjs
git commit -m "feat: add canonical workspace manifest"
```

### Task 2: Hard budget validation

**Files:**

- Create: `scripts/workspace/budgets.mjs`
- Create: `test/budgets.test.mjs`
- Modify: `workspace.yaml`

**Interfaces:**

- Consumes: normalized `budgets` from manifest.
- Produces: `utf8Bytes(text): number`
- Produces: `checkBudget({kind, path, content}, budgets): BudgetFinding | null`
- Produces stable findings sorted by repository/path.

- [ ] **Step 1: добавить failing byte-limit tests**

Покрыть UTF-8, exact/over boundary и unknown artifact kind.

```js
test("blocks content one byte over the configured limit", () => {
  assert.deepEqual(
    checkBudget({ kind: "state", path: "state.md", content: "12345" }, { state: 4 }),
    { code: "BUDGET_EXCEEDED", path: "state.md", actual: 5, maximum: 4 }
  );
});
```

- [ ] **Step 2: подтвердить RED**

Run: `node --test test/budgets.test.mjs`  
Expected: FAIL.

- [ ] **Step 3: реализовать deterministic checks**

Использовать `Buffer.byteLength(content, "utf8")`. Limits задаются bytes: `AI.md=1024`, `FLOW.md=2048`, global role `6144`, managed AGENTS block `1024`, context `8192`, decision `4096`, prompt `8192`, state `2048`, result `4096`, plan `16384`.

- [ ] **Step 4: подтвердить GREEN**

Run: `node --test test/budgets.test.mjs`  
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add workspace.yaml scripts/workspace/budgets.mjs test/budgets.test.mjs
git commit -m "feat: enforce AI context budgets"
```

### Task 3: Deterministic rendering

**Files:**

- Create: `scripts/workspace/render.mjs`
- Create: `test/render.test.mjs`
- Modify: `projects/index.md`

**Interfaces:**

- Produces: `renderProjectIndex(manifest): string`
- Produces: `renderProfileNavigation(manifest): string`
- Produces: `renderAgentsBlock(project): string`
- Produces: `replaceManagedBlock(source, marker, rendered): string`
- Managed markers: `<!-- ai-workflow:<name>:start -->` и `<!-- ai-workflow:<name>:end -->`.

- [ ] **Step 1: добавить failing renderer tests**

Проверить stable order, labels, canonical links, final LF, idempotency и malformed/duplicate markers.

- [ ] **Step 2: подтвердить RED**

Run: `node --test test/render.test.mjs`  
Expected: FAIL.

- [ ] **Step 3: реализовать pure renderers**

Renderer остаётся pure. `replaceManagedBlock` меняет только единственную valid marker pair; отсутствие markers планирует insert, malformed markers блокируют.

- [ ] **Step 4: сгенерировать новый project index**

Index ссылается на target `.ai/context.md`, показывает `managed/read-only` и `onboarding/active`. Legacy contexts не входят в reading route.

- [ ] **Step 5: подтвердить GREEN и no drift**

Run: `node --test test/render.test.mjs`  
Run: `node scripts/workspace/cli.mjs check --manifest-only` после Task 5.  
Expected: tests PASS; generated index exact.

- [ ] **Step 6: commit**

```bash
git add scripts/workspace/render.mjs test/render.test.mjs projects/index.md
git commit -m "feat: render workspace routes deterministically"
```

### Task 4: Safe plan/apply engine

**Files:**

- Create: `scripts/workspace/operations.mjs`
- Create: `scripts/workspace/cli.mjs`
- Create: `test/operations.test.mjs`
- Create: `test/cli.test.mjs`
- Create: `test/fixtures/workspace/`

**Interfaces:**

- Produces: `planWorkspace({manifest, root, fs, git}): Promise<Operation[]>`
- Produces: `applyOperations({operations, fs, git}): Promise<ApplyResult>`
- Operation kinds limited to `clone`, `create-file`, `replace-managed-block`.
- Exit codes: `0` success/no drift, `1` validation or drift, `2` blocked unsafe state.

- [ ] **Step 1: добавить failing safety tests**

Покрыть clone/no-op, wrong remote, collision, dirty/multi-worktree, path escape, read-only, populated context, bad markers и idempotency.

```js
test("never creates operations for a read-only project", async () => {
  const operations = await planWorkspace(readOnlyFixture());
  assert.deepEqual(operations, []);
});

test("blocks a destination with the wrong origin", async () => {
  await assert.rejects(() => planWorkspace(wrongOriginFixture()), /REMOTE_MISMATCH/);
});
```

- [ ] **Step 2: подтвердить RED**

Run: `node --test test/operations.test.mjs test/cli.test.mjs`  
Expected: FAIL.

- [ ] **Step 3: реализовать planner**

Перед mutation проверить canonical-root containment, destination, `.git`, origin, clean status и worktrees. Не планировать move/delete/reset/clean/stash.

- [ ] **Step 4: реализовать apply**

Apply принимает только typed operations, повторяет preconditions перед mutation и safe-stops при drift. Файлы создаются только при отсутствии; updates ограничены managed markers.

- [ ] **Step 5: реализовать CLI**

```text
node scripts/workspace/cli.mjs check [--root <path>] [--manifest-only]
node scripts/workspace/cli.mjs plan --root <path>
node scripts/workspace/cli.mjs apply --root <path>
```

Не принимать implicit `~` expansion внутри Node: shell передаёт resolved path либо CLI использует `os.homedir()` только для canonical configured root.

- [ ] **Step 6: подтвердить GREEN и idempotency**

Run: `node --test test/operations.test.mjs test/cli.test.mjs`  
Expected: PASS; second apply fixture reports zero operations.

- [ ] **Step 7: commit**

```bash
git add scripts/workspace/operations.mjs scripts/workspace/cli.mjs test/operations.test.mjs test/cli.test.mjs test/fixtures
git commit -m "feat: add safe workspace plan and apply"
```

### Task 5: GitHub-only workflow documents и local contract

**Files:**

- Create: `global/core.md`
- Create: `global/architect.md`
- Create: `global/executor.md`
- Create: `projects/README.md`
- Create: `.ai/context.md`
- Create: `.ai/decisions.md`
- Modify: `FLOW.md`
- Modify: `AGENTS.md`
- Modify: `global/context.md`
- Modify: `global/workflow.md`
- Modify: `README.md`
- Modify: `.gitignore`
- Test: `test/budgets.test.mjs`
- Test: `test/render.test.mjs`

**Interfaces:**

- `FLOW.md` задаёт exact Sol reading order.
- `global/core.md` хранит invariant policy.
- `global/architect.md` хранит risk classification и handoff rules.
- `global/executor.md` является source для compact Luna execution contract.
- Root `AGENTS.md` содержит один managed routing block и local repository rules.

- [ ] **Step 1: расширить failing tests на реальные canonical files**

Tests читают repository files, проверяют hard budgets, отсутствие forbidden memory wording, отсутствие duplicate active workflow blocks и exact generated index.

- [ ] **Step 2: подтвердить RED**

Run: `npm test`  
Expected: FAIL до rewrite canonical files.

- [ ] **Step 3: написать compact English agent documents**

Сохранить без дублирования: GitHub source of truth, no memory/subagents, explicit match, read-only, risk classes, immutable handoff, bounded failure, no merge/auto-merge.

- [ ] **Step 4: сделать legacy boundary явной**

Пометить старые central contexts как migration-only вне reading order; оставить короткие compatibility pointers. Ничего не удалять.

- [ ] **Step 5: обновить local AI contract**

`.ai/context.md` фиксирует repository purpose, Node commands, `master` PR target и local completion gate `npm run verify`. `.ai/decisions.md` содержит только durable foundation decisions.

- [ ] **Step 6: подтвердить GREEN и budgets**

Run: `npm test`  
Run: `node scripts/workspace/cli.mjs check --manifest-only`  
Expected: PASS; каждый canonical artifact укладывается в limit.

- [ ] **Step 7: commit**

```bash
git add FLOW.md AGENTS.md README.md .gitignore global projects .ai/context.md .ai/decisions.md test
git commit -m "docs: establish GitHub-only agent routing"
```

### Task 6: Completion gate и bounded review

**Files:**

- Modify: `package.json`
- Modify: `.ai/tasks/github-rooted-workflow-foundation/state.md`
- Create after completion: `.ai/tasks/github-rooted-workflow-foundation/result.md`

- [ ] **Step 1: определить full gate**

`npm run verify` последовательно выполняет tests, manifest-only validation, generated drift check и `git diff --check`.

- [ ] **Step 2: запустить targeted и full verification**

```bash
npm test
node scripts/workspace/cli.mjs check --manifest-only
npm run verify
```

Expected: все команды exit 0. Не запускать реальный `apply` на `~/Desktop/WORK`.

- [ ] **Step 3: проверить полный task-owned diff**

Review batches: schema/budgets; render/markers; filesystem safety; reading order; exclusions. Затем cross-file pass `workspace.yaml → CLI → index → FLOW.md → AGENTS.md`.

- [ ] **Step 4: обновить state/result**

`state.md` должен заменить initial state финальным `READY_FOR_HUMAN_MERGE`. `result.md` перечисляет changes, exact checks и remaining issues без raw logs.

- [ ] **Step 5: final commit и push**

```bash
git add package.json package-lock.json .ai/tasks/github-rooted-workflow-foundation
git commit -m "chore: finalize workflow foundation"
git push -u origin task/github-rooted-agent-architecture
```

Если после предыдущего commit нет изменений, не создавать empty commit.

- [ ] **Step 6: открыть PR**

Создать или обновить PR из `task/github-rooted-agent-architecture` в `master`. Проверить required CI. Не merge и не включать auto-merge. Финальный статус: `READY_FOR_HUMAN_MERGE`.
