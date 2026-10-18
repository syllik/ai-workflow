import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  DEFAULT_CONTEXT_POLICY, validateContextPolicyConfig, resolveContextPolicy,
  evaluateContextBytes, validateContextCoverage, assessRuntime, checkDocumentBudget, chooseCompaction,
  signContextCheckpoint, verifyContextCheckpoint
} from '../scripts/workspace/context-policy.mjs';

const sha40 = 'a'.repeat(40);
const sha64 = s => createHash('sha256').update(s).digest('hex');
const source = (overrides = {}) => ({
  kind: 'policy', repository: 'syllik/ai-workflow', path: 'FLOW.md', revisionSha: sha40,
  blobSha: 'b'.repeat(40), sha256: sha64('entire-source'), content: 'entire-source',
  verifiedByGit: true, state: 'COVERED', consumption: { fullSource: true, sourceSha256: sha64('entire-source') },
  coveredRequirements: ['REQ-1'], coveredAcceptance: ['ACC-1'], ...overrides
});
const id = 'syllik/ai-workflow@' + sha40 + ':FLOW.md';
const trustedSource = s => ({ repository: s.repository, path: s.path, revisionSha: s.revisionSha, blobSha: s.blobSha, content: 'entire-source' });
const verifyCoverage = data => validateContextCoverage(data, trustedSource);
const coverage = (overrides = {}) => ({ sources: [source()], expectedSources: [source()], mandatorySourceIds: [id], requirementIds: ['REQ-1'], acceptanceIds: ['ACC-1'], declaredDependencies: [], ...overrides });
const handoff = { contractVersion: 2, repository: 'syllik/life-ops-bot' };
const activation = { ...DEFAULT_CONTEXT_POLICY, rolloutAllowlist: ['syllik/life-ops-bot'] };
const checkpointPayload = () => ({
  contractVersion: 2, contextPolicyVersion: 2, policySha: sha40, baseSha: sha40, headSha: sha40,
  repository: handoff.repository, approval: { reference: 'owner-record' }, allowedPaths: ['FLOW.md'],
  sources: [source()], requirementCoverage: ['REQ-1'], completedWork: [], pendingWork: ['task'], validationEvidence: []
});
const checkpointRuntime = p => ({ ...p, freshAuthorityValidated: true, allMandatorySourcesRehydrated: true, coverageRevalidated: true });
const secret = 'trusted runtime storage secret never provided to agent';
const has = (xs, code) => xs.some(x => x.code === code);

test('default feature gate disabled, v1 accepted', () => {
  assert.deepEqual(validateContextPolicyConfig(), []);
  assert.deepEqual(resolveContextPolicy(handoff).version, 1);
  assert.equal(resolveContextPolicy(handoff).admitted, true);
  assert.equal(resolveContextPolicy({ ...handoff, contextPolicyVersion: 2 }).admitted, false);
});
test('explicit allowlist enables only opted-in v2, and task contract remains v2', () => {
  assert.equal(resolveContextPolicy({ ...handoff, contextPolicyVersion: 2 }, activation).admitted, true);
  assert.ok(has(resolveContextPolicy({ ...handoff, contractVersion: 1, contextPolicyVersion: 2 }, activation).findings, 'TASK_CONTEXT_VERSION_MISMATCH'));
});
test('legacy v1 pinned independently, more than 32768 rejected', () => {
  assert.ok(has(evaluateContextBytes(1, 'x'.repeat(32769)).findings, 'ASSEMBLED_CONTEXT_BUDGET_EXCEEDED'));
  assert.equal(evaluateContextBytes(1, 'x'.repeat(32768)).valid, true);
  assert.equal(resolveContextPolicy(handoff, activation).version, 1);
});
test('v2 supports >32768 bytes and measures actual UTF-8 bytes', () => {
  const r = evaluateContextBytes(2, '✓'.repeat(20000));
  assert.equal(r.valid, true);
  assert.equal(r.actualBytes, 60000);
  assert.equal(r.maxBytes, null);
});
test('Zero-Touch-DCA explicitly excluded even if someone allowlists it', () => {
  const p = { ...DEFAULT_CONTEXT_POLICY, rolloutAllowlist: ['syllik/Zero-Touch-DCA'] };
  assert.ok(has(validateContextPolicyConfig(p), 'EXCLUDED_REPOSITORY_IN_ALLOWLIST'));
  assert.ok(has(resolveContextPolicy({ ...handoff, repository: 'syllik/Zero-Touch-DCA', contextPolicyVersion: 2 }, p).findings, 'EXCLUDED_REPOSITORY'));
});
test('cannot remove Zero-Touch exclusion', () => assert.ok(has(validateContextPolicyConfig({ ...activation, excludedRepositories: [] }), 'MISSING_REQUIRED_EXCLUSION')));
test('source coverage happy path', () => assert.deepEqual(verifyCoverage(coverage()), []));
test('source receipt flag without authoritative Git loader cannot pass', () => assert.ok(has(validateContextCoverage(coverage()), 'UNVERIFIED_GIT_SOURCE')));
test('mandatory source absent and expected source missing', () => {
  const findings = verifyCoverage(coverage({ sources: [] }));
  assert.ok(has(findings, 'MISSING_MANDATORY_SOURCE'));
  assert.ok(has(findings, 'MISSING_EXPECTED_SOURCE'));
});
test('SHA/content mismatch is detected against the independent Git loader', () => {
  const findings = verifyCoverage(coverage({ sources: [source({ content: 'tampered', verifiedByGit: false })] }));
  assert.ok(has(findings, 'CONTEXT_HASH_MISMATCH'));
  assert.ok(!has(findings, 'UNVERIFIED_GIT_SOURCE')); // Self-reported flags have no authority when the trusted loader succeeds.
});
test('wrong expected Git revision fails closed', () => {
  const findings = verifyCoverage(coverage({ expectedSources: [source({ revisionSha: 'c'.repeat(40) })] }));
  assert.ok(has(findings, 'UNEXPECTED_CONTEXT_SOURCE'));
  assert.ok(has(findings, 'MISSING_EXPECTED_SOURCE'));
});
test('duplicate, undeclared dependency and wrong requirement binding detected', () => {
  const dependency = source({ kind: 'dependency', repository: 'vendor/foreign', revisionSha: 'd'.repeat(40), path: 'policy.md', coveredRequirements: [] });
  const findings = verifyCoverage(coverage({ sources: [source(), source(), dependency], expectedSources: [source(), dependency], requirementIds: ['REQ-1', 'REQ-2'] }));
  assert.ok(has(findings, 'DUPLICATE_CONTEXT_SOURCE'));
  assert.ok(has(findings, 'UNDECLARED_CONTEXT_DEPENDENCY'));
  assert.ok(has(findings, 'UNCOVERED_REQUIREMENT'));
});
test('receipt-only or partially read normative sources cannot count as consumed', () => {
  const findings = verifyCoverage(coverage({ sources: [source({ state: 'RETRIEVED', consumption: {} })] }));
  assert.ok(has(findings, 'MANDATORY_SOURCE_NOT_CONSUMED'));
  assert.ok(has(findings, 'UNCOVERED_REQUIREMENT'));
  assert.ok(has(findings, 'UNCOVERED_ACCEPTANCE'));
});
test('false full-source consumption evidence is rejected', () => {
  const findings = verifyCoverage(coverage({ sources: [source({ consumption: { fullSource: true, sourceSha256: 'f'.repeat(64) } })] }));
  assert.ok(has(findings, 'INCOMPLETE_SOURCE_CONSUMPTION'));
});
test('runtime missing -> UNMEASURED and progressive checkpoint', () => {
  assert.deepEqual(assessRuntime(), { status: 'UNMEASURED', decision: 'PROGRESSIVE_CHECKPOINT', findings: [] });
});
test('runtime unreliable -> UNRELIABLE', () => assert.equal(assessRuntime({ status: 'MEASURED', capacityTokens: 100, usedTokens: 50, reserveTokens: 10, reliable: false }).status, 'UNRELIABLE'));
test('runtime near capacity uses runtime-specific reserve not a universal token gate', () => {
  assert.equal(assessRuntime({ status: 'MEASURED', capacityTokens: 400, usedTokens: 350, reserveTokens: 51, reliable: true, trustedAdapter: true }).decision, 'BLOCKED_CAPACITY');
  assert.equal(assessRuntime({ status: 'MEASURED', capacityTokens: 400000, usedTokens: 350, reserveTokens: 51, reliable: true, trustedAdapter: true }).decision, 'CONTINUE');
});
test('checkpoint valid only after fresh authority and source revalidation', () => {
  const p = checkpointPayload();
  const ckpt = signContextCheckpoint(p, secret);
  assert.deepEqual(verifyContextCheckpoint(ckpt, secret, checkpointRuntime(p)), { valid: true, findings: [] });
  assert.ok(has(verifyContextCheckpoint(ckpt, secret, p).findings, 'CHECKPOINT_REVALIDATION_REQUIRED'));
});
test('forged checkpoint fails MAC', () => {
  const p = checkpointPayload(); const ckpt = signContextCheckpoint(p, secret);
  const fake = { ...ckpt, payload: { ...p, allowedPaths: ['**'] } };
  assert.ok(has(verifyContextCheckpoint(fake, secret, checkpointRuntime(fake.payload)).findings, 'FORGED_CHECKPOINT'));
});
test('malformed and partial checkpoints fail', () => {
  assert.ok(has(verifyContextCheckpoint({}, secret, {}).findings, 'INVALID_CHECKPOINT'));
  const p = checkpointPayload(); delete p.validationEvidence;
  const ckpt = signContextCheckpoint(p, secret);
  assert.ok(has(verifyContextCheckpoint(ckpt, secret, checkpointRuntime(p)).findings, 'INCOMPLETE_CHECKPOINT'));
});
test('stale checkpoint on repository drift or v2/v1 mismatch fails', () => {
  const p = checkpointPayload(); const ckpt = signContextCheckpoint(p, secret);
  assert.ok(has(verifyContextCheckpoint(ckpt, secret, checkpointRuntime({ ...p, headSha: 'f'.repeat(40) })).findings, 'CHECKPOINT_REPOSITORY_DRIFT'));
  assert.ok(has(verifyContextCheckpoint(ckpt, secret, checkpointRuntime({ ...p, contextPolicyVersion: 1 })).findings, 'CHECKPOINT_REPOSITORY_DRIFT'));
});
test('feature-gate rollback disables new v2 admissions without reinterpreting them as v1', () => {
  const v2Handoff = { ...handoff, contextPolicyVersion: 2 };
  assert.equal(resolveContextPolicy(v2Handoff, activation).admitted, true);
  const after = resolveContextPolicy(v2Handoff, DEFAULT_CONTEXT_POLICY);
  assert.equal(after.admitted, false);
  assert.equal(after.version, 2);
  assert.equal(resolveContextPolicy(handoff, DEFAULT_CONTEXT_POLICY).admitted, true);
});

test('v1 hard length and v2 advisory for roles; entrypoints remain hard', () => {
  const budgets = { 'AI.md': 5, 'FLOW.md': 5, 'global role file': 5 };
  const v1 = checkDocumentBudget('global/executor.md', '123456', 1, budgets);
  const v2 = checkDocumentBudget('global/executor.md', '123456', 2, budgets);
  const entry = checkDocumentBudget('FLOW.md', '123456', 2, budgets);
  assert.equal(v1.blocked, true);
  assert.equal(v1.findings[0].severity, 'HARD');
  assert.equal(v2.blocked, false);
  assert.equal(v2.findings[0].severity, 'ADVISORY');
  assert.equal(entry.blocked, true);
});
test('unsupported compaction falls back to checkpoints unless required', () => {
  assert.equal(chooseCompaction({ nativeCompaction: 'UNSUPPORTED' }).action, 'VERIFIED_CHECKPOINT_RESTART');
  assert.equal(chooseCompaction({ nativeCompaction: 'UNSUPPORTED' }, { required: true }).blocked, true);
  assert.equal(chooseCompaction({ nativeCompaction: 'SUPPORTED', trustedAdapter: false }).action, 'VERIFIED_CHECKPOINT_RESTART');
});

test('runtime cannot claim trust with a self-reported reliable flag alone', () => {
  assert.equal(assessRuntime({ status: 'MEASURED', capacityTokens: 1000, usedTokens: 100, reserveTokens: 100, reliable: true }).status, 'UNRELIABLE');
});
test('malformed source input returns findings, not a false pass', () => {
  const findings = validateContextCoverage(coverage({ sources: [null] }), trustedSource);
  assert.ok(has(findings, 'INVALID_CONTEXT_SOURCE'));
  assert.ok(has(findings, 'MISSING_MANDATORY_SOURCE'));
});

// Consolidated Codex review findings for PR #63, commit e372db6.
test('source kind cannot impersonate trusted expected dependency authorization', () => {
  const expectedDependency = source({ kind: 'dependency', repository: 'vendor/foreign', revisionSha: 'd'.repeat(40), path: 'policy.md' });
  const relabeled = { ...expectedDependency, kind: 'policy' };
  const findings = verifyCoverage(coverage({
    sources: [source(), relabeled], expectedSources: [source(), expectedDependency], declaredDependencies: []
  }));
  assert.ok(has(findings, 'CONTEXT_SOURCE_KIND_MISMATCH'));
  assert.ok(has(findings, 'UNDECLARED_CONTEXT_DEPENDENCY'));
});

test('invalid expected source kind fails closed', () => {
  const findings = verifyCoverage(coverage({ expectedSources: [source({ kind: 'made-up' })] }));
  assert.ok(has(findings, 'INVALID_EXPECTED_SOURCE'));
  assert.ok(has(findings, 'UNEXPECTED_CONTEXT_SOURCE'));
});

test('checkpoint contract version drift is rejected even with same context policy', () => {
  const payload = { ...checkpointPayload(), contextPolicyVersion: 1 };
  const checkpoint = signContextCheckpoint(payload, secret);
  const findings = verifyContextCheckpoint(checkpoint, secret, checkpointRuntime({ ...payload, contractVersion: 1 })).findings;
  assert.ok(has(findings, 'CHECKPOINT_REPOSITORY_DRIFT'));
});

test('explicit null context policy version is not an omitted legacy field', () => {
  const result = resolveContextPolicy({ ...handoff, contextPolicyVersion: null });
  assert.equal(result.admitted, false);
  assert.ok(has(result.findings, 'UNSUPPORTED_CONTEXT_POLICY_VERSION'));
});

test('repository-root documents preserve v1 hard budgets and v2 advisory budgets', () => {
  const budgets = { 'managed AGENTS block': 3, '.ai/context.md': 3 };
  for (const path of ['AGENTS.md', '.ai/context.md']) {
    const v1 = checkDocumentBudget(path, 'four', 1, budgets);
    const v2 = checkDocumentBudget(path, 'four', 2, budgets);
    assert.equal(v1.blocked, true, path);
    assert.equal(v1.findings[0].code, 'BUDGET_EXCEEDED', path);
    assert.equal(v2.blocked, false, path);
    assert.equal(v2.findings[0].severity, 'ADVISORY', path);
  }
});

test('malformed null policy configuration returns denied findings, not exception', () => {
  const result = resolveContextPolicy(handoff, null);
  assert.equal(result.admitted, false);
  assert.ok(has(result.findings, 'INVALID_CONTEXT_POLICY'));
});

test('non-string trusted repository identity fails closed', () => {
  const findings = validateContextCoverage(coverage(), sourceRecord => ({
    ...trustedSource(sourceRecord), repository: 123
  }));
  assert.ok(has(findings, 'UNVERIFIED_GIT_SOURCE'));
});

// Codex second-review findings on commit d9b93a6; first additional owner-authorized correction batch.
test('coverage requires unique arrays and never uses substring membership', () => {
  const malformed = source({ coveredRequirements: 'REQ-10', coveredAcceptance: 'ACC-10' });
  const findings = verifyCoverage(coverage({ sources: [malformed] }));
  assert.ok(has(findings, 'INVALID_CONTEXT_COVERAGE_CLAIMS'));
  assert.ok(has(findings, 'UNCOVERED_REQUIREMENT'));
  assert.ok(has(findings, 'UNCOVERED_ACCEPTANCE'));
});

test('coverage rejects duplicate or absent claims even when receipt state is COVERED', () => {
  for (const bad of [source({ coveredRequirements: ['REQ-1', 'REQ-1'] }), source({ coveredAcceptance: ['ACC-1', 'ACC-1'] }), source({ coveredAcceptance: undefined })]) {
    const findings = verifyCoverage(coverage({ sources: [bad] }));
    assert.ok(has(findings, 'INVALID_CONTEXT_COVERAGE_CLAIMS'));
  }
});

test('signed checkpoint rejects malformed required values even when current mirrors them', () => {
  const invalid = [
    { contractVersion: null }, { contextPolicyVersion: null }, { policySha: null },
    { baseSha: '0'.repeat(39) }, { headSha: 123 }, { repository: null },
    { approval: { reference: '' } }, { approval: null },
    { allowedPaths: null }, { allowedPaths: ['../escape'] },
    { sources: null }, { sources: [null] }, { requirementCoverage: null },
    { completedWork: null }, { pendingWork: null }, { validationEvidence: null }
  ];
  for (const overrides of invalid) {
    const payload = { ...checkpointPayload(), ...overrides };
    const ckpt = signContextCheckpoint(payload, secret);
    const result = verifyContextCheckpoint(ckpt, secret, checkpointRuntime(payload));
    assert.equal(result.valid, false, JSON.stringify(overrides));
    assert.ok(has(result.findings, 'INVALID_CHECKPOINT_PAYLOAD'), JSON.stringify(overrides));
  }
});

test('checkpoint resume binds approval, scope, manifest and coverage', () => {
  const payload = checkpointPayload();
  const checkpoint = signContextCheckpoint(payload, secret);
  for (const changed of [
    { approval: { reference: 'different-approval' } },
    { allowedPaths: ['**'] },
    { sources: [source({ blobSha: 'c'.repeat(40) })] },
    { requirementCoverage: ['REQ-2'] }
  ]) {
    const result = verifyContextCheckpoint(checkpoint, secret, checkpointRuntime({ ...payload, ...changed }));
    assert.equal(result.valid, false);
    assert.ok(has(result.findings, 'CHECKPOINT_AUTHORITY_DRIFT'));
  }
});

// Codex third-review finding on e0d0af8; second owner-authorized extra correction batch.
test('checkpoint scope, coverage and source manifests ignore collection order', () => {
  const payload = checkpointPayload();
  payload.allowedPaths = ['FLOW.md', 'AI.md'];
  payload.requirementCoverage = ['REQ-1', 'REQ-2'];
  payload.sources = [source(), source({ path: 'AI.md' })];
  const checkpoint = signContextCheckpoint(payload, secret);
  const current = checkpointRuntime({
    ...payload,
    allowedPaths: [...payload.allowedPaths].reverse(),
    requirementCoverage: [...payload.requirementCoverage].reverse(),
    sources: [...payload.sources].reverse()
  });
  assert.deepEqual(verifyContextCheckpoint(checkpoint, secret, current), { valid: true, findings: [] });
});

test('checkpoint approval and source record property key order are semantic, not authority drift', () => {
  const payload = checkpointPayload();
  payload.approval = { reference: 'owner-record', publicationAllowed: false, nested: { role: 'executor', batches: 1 } };
  const checkpoint = signContextCheckpoint(payload, secret);
  const reverseKeys = object => Object.fromEntries(Object.entries(object).reverse());
  const current = checkpointRuntime({
    ...payload,
    approval: { nested: reverseKeys(payload.approval.nested), publicationAllowed: false, reference: 'owner-record' },
    sources: payload.sources.map(reverseKeys)
  });
  assert.deepEqual(verifyContextCheckpoint(checkpoint, secret, current), { valid: true, findings: [] });
});

test('semantic checkpoint comparison still rejects changed and duplicated authority', () => {
  const payload = checkpointPayload();
  payload.allowedPaths = ['FLOW.md', 'AI.md'];
  payload.sources = [source(), source({ path: 'AI.md' })];
  payload.requirementCoverage = ['REQ-1', 'REQ-2'];
  const checkpoint = signContextCheckpoint(payload, secret);
  for (const changed of [
    { allowedPaths: ['AI.md', 'DIFFERENT.md'] },
    { allowedPaths: ['AI.md', 'AI.md'] },
    { sources: [source({ path: 'AI.md' }), source({ path: 'AI.md' })] },
    { requirementCoverage: ['REQ-2', 'REQ-2'] },
    { approval: { reference: 'another-approval' } }
  ]) {
    const result = verifyContextCheckpoint(checkpoint, secret, checkpointRuntime({ ...payload, ...changed }));
    assert.equal(result.valid, false, JSON.stringify(changed));
    assert.ok(has(result.findings, 'CHECKPOINT_AUTHORITY_DRIFT'), JSON.stringify(changed));
  }
});
