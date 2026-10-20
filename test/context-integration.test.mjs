import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluateContextAdmission, recoverContextAdmission } from '../scripts/workspace/context-admission.mjs';
import { createContextCheckpointStore } from '../scripts/workspace/context-checkpoint-store.mjs';
import { evaluateTaskAction } from '../scripts/workspace/task-policy.mjs';

const sha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const headSha = 'c'.repeat(40);
const taskBranch = 'feat/issue-64-context-policy-v2-integration';
const sourceContent = '# trusted source\n';
const sourceSha = createHash('sha256').update(sourceContent).digest('hex');
const source = {
  kind: 'policy', repository: 'syllik/ai-workflow', path: 'FLOW.md', revisionSha: sha,
  blobSha: 'd'.repeat(40), sha256: sourceSha, state: 'COVERED', content: sourceContent,
  consumption: { fullSource: true, sourceSha256: sourceSha },
  coveredRequirements: ['I0'], coveredAcceptance: ['A1']
};
const sourceId = `syllik/ai-workflow@${sha}:FLOW.md`;
const config = {
  supportedVersions: [1, 2], defaultNewTaskVersion: 1,
  rolloutAllowlist: ['syllik/ai-workflow'], excludedRepositories: ['syllik/Zero-Touch-DCA']
};
const handoff = {
  contractVersion: 2, taskId: 'syllik/ai-workflow#64', repository: 'syllik/ai-workflow',
  taskBranch, integrationBranch: 'master', requiredCiChecks: ['verify'], role: 'executor',
  policySha: sha, baseSha, headSha, contextPolicyVersion: 2,
  approval: { reference: 'https://github.com/syllik/ai-workflow/issues/64#issuecomment-6273710738', allowedPaths: ['scripts/workspace/**', 'test/**'], publication: 'allowed', maxCorrectionBatches: 2 },
  assembledContextBudgetBytes: null, assembledContextActualBytes: 40000, assembledContextCheck: 'PASSED'
};
const trustedSource = current => ({
  repository: current.repository, path: current.path, revisionSha: current.revisionSha,
  blobSha: current.blobSha, content: sourceContent,
  consumption: { fullSource: true, sourceSha256: sourceSha },
  coveredRequirements: ['I0'], coveredAcceptance: ['A1']
});
const assembledContext = 'x'.repeat(40000);
const assembledContextSha256 = createHash('sha256').update(assembledContext).digest('hex');
const { content: _content, consumption: _consumption, state: _state, coveredRequirements: _req, coveredAcceptance: _acc, ...expectedSource } = source;
function trustedManifest(overrides = {}) {
  return {
    contextPolicyVersion: 2, repository: handoff.repository, policySha: sha, baseSha, headSha,
    expectedSources: [{ kind: source.kind, repository: source.repository, path: source.path, revisionSha: sha }],
    mandatorySourceIds: [sourceId], requirementIds: ['I0'], acceptanceIds: ['A1'], dependencies: [],
    sources: [expectedSource], assembledContextSha256,
    assembledContextBudgetBytes: null, assembledContextActualBytes: 40000, assembledContextCheck: 'PASSED',
    ...overrides
  };
}
function receipt(overrides = {}) {
  return {
    contextPolicyVersion: 2, policySha: sha, baseSha, headSha, repository: handoff.repository,
    assembledContext, assembledContextSha256, assembledContextActualBytes: 40000,
    assembledContextBudgetBytes: null, assembledContextCheck: 'PASSED',
    expectedSources: [source], sources: [source], mandatorySourceIds: [sourceId],
    requirementIds: ['I0'], acceptanceIds: ['A1'], declaredDependencies: [],
    runtime: { status: 'UNMEASURED' }, ...overrides
  };
}
function runtime(overrides = {}) {
  return {
    currentRepository: handoff.repository, currentPolicySha: sha, currentBaseSha: baseSha,
    currentHeadSha: headSha, currentBranch: taskBranch,
    workspaceRecord: { repository: handoff.repository, access: 'managed', status: 'active', integrationBranch: 'master' },
    diffEvidence: { baseSha, headSha, changedPaths: [] }, contextReceipt: receipt(),
    contextSourceVerifier: trustedSource, ...overrides
  };
}

test('real evaluateTaskAction admits activated v2 context above 32768 with trusted evidence', () => {
  const result = evaluateTaskAction({ handoff, runtime: runtime(), action: { kind: 'execute', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: [] }, contextPolicy: config, contextManifest: trustedManifest() });
  assert.equal(result.allowed, true);
  assert.deepEqual(result.findings, []);
});

test('disabled v2 admission fails closed without treating the handoff as v1', () => {
  const result = evaluateContextAdmission({ handoff, contextPolicy: { ...config, rolloutAllowlist: [] }, trustedManifest: trustedManifest(), receipt: receipt(), sourceVerifier: trustedSource });
  assert.equal(result.allowed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_V2_NOT_ACTIVATED'), true);
});

test('unauthorized source evidence produces zero loader calls', () => {
  let calls = 0;
  const unauthorized = { ...source, repository: 'evil.example/impersonator', path: 'secret.md' };
  const result = evaluateContextAdmission({
    handoff, contextPolicy: config, trustedManifest: trustedManifest(),
    receipt: receipt({ expectedSources: [source], sources: [unauthorized] }),
    sourceVerifier: current => { calls += 1; return trustedSource(current); }
  });
  assert.equal(calls, 0);
  assert.equal(result.allowed, false);
});

test('malformed v2 receipts fail closed without throwing', () => {
  let result;
  assert.doesNotThrow(() => {
    result = evaluateContextAdmission({
      handoff, contextPolicy: config, trustedManifest: trustedManifest(),
      receipt: { assembledContextSha256: 'a'.repeat(64) },
      sourceVerifier: trustedSource
    });
  });
  assert.equal(result.allowed, false);
});

test('false coverage, stale identity and unreliable runtime are blocked', () => {
  const falseCoverage = evaluateContextAdmission({ handoff, contextPolicy: config, trustedManifest: trustedManifest(), receipt: receipt({ sources: [{ ...source, coveredRequirements: ['I1'] }] }), sourceVerifier: trustedSource });
  assert.equal(falseCoverage.allowed, false);
  assert.equal(falseCoverage.findings.some(({ code }) => code === 'UNVERIFIED_SOURCE_COVERAGE'), true);
  const stale = evaluateContextAdmission({ handoff, contextPolicy: config, trustedManifest: trustedManifest(), receipt: receipt({ headSha: 'e'.repeat(40) }), sourceVerifier: trustedSource });
  assert.equal(stale.allowed, false);
  const unreliable = evaluateContextAdmission({ handoff, contextPolicy: config, trustedManifest: trustedManifest(), receipt: receipt({ runtime: { status: 'MEASURED', usedTokens: 1, capacityTokens: 2, reserveTokens: 1, reliable: false, trustedAdapter: true } }), sourceVerifier: trustedSource });
  assert.equal(unreliable.allowed, false);
  assert.equal(unreliable.findings.some(({ code }) => code === 'UNRELIABLE_RUNTIME_METRICS'), true);
});

test('checkpoint recovery rehydrates only after fresh authority and coverage revalidation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ai-workflow-context-admission-'));
  const secret = 'trusted checkpoint secret held outside agent context';
  const checkpointStore = createContextCheckpointStore({ directory, secretProvider: () => secret });
  const savedReceipt = receipt();
  const checkpointPayload = {
    contractVersion: 2, contextPolicyVersion: 2, policySha: sha, baseSha, headSha,
    repository: handoff.repository, approval: handoff.approval, allowedPaths: handoff.approval.allowedPaths,
    sources: savedReceipt.sources, requirementCoverage: savedReceipt.requirementIds,
    completedWork: [], pendingWork: ['resume'], validationEvidence: ['local-admission-test']
  };
  assert.equal((await checkpointStore.save('issue-64', checkpointPayload, { sequence: 1 })).valid, true);
  const current = {
    ...checkpointPayload, freshAuthorityValidated: true,
    allMandatorySourcesRehydrated: true, coverageRevalidated: true
  };
  const recovered = await recoverContextAdmission({
    store: checkpointStore, checkpointId: 'issue-64', current,
    handoff, contextPolicy: config, trustedManifest: trustedManifest(), receipt: savedReceipt, sourceVerifier: trustedSource
  });
  assert.equal(recovered.allowed, true);
  const stale = await recoverContextAdmission({
    store: checkpointStore, checkpointId: 'issue-64', current: { ...current, coverageRevalidated: false },
    handoff, contextPolicy: config, trustedManifest: trustedManifest(), receipt: savedReceipt, sourceVerifier: trustedSource
  });
  assert.equal(stale.allowed, false);
  assert.equal(stale.findings.some(({ code }) => code === 'CHECKPOINT_REVALIDATION_REQUIRED'), true);
});

const executeAction = { kind: 'execute', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: [] };
const codes = result => result.findings.map(({ code }) => code);

test('receipt-supplied empty coverage sets cannot bypass the trusted manifest', () => {
  const emptyReceipt = receipt({ sources: [], expectedSources: [], mandatorySourceIds: [], requirementIds: [], acceptanceIds: [], declaredDependencies: [] });
  const result = evaluateTaskAction({ handoff, runtime: runtime({ contextReceipt: emptyReceipt }), action: executeAction, contextPolicy: config, contextManifest: trustedManifest() });
  assert.equal(result.allowed, false);
  assert.equal(codes(result).includes('MISSING_MANDATORY_SOURCE'), true);
});

test('v2 admission requires a trusted producer manifest with non-empty required sets', () => {
  const missing = evaluateTaskAction({ handoff, runtime: runtime(), action: executeAction, contextPolicy: config });
  assert.equal(missing.allowed, false);
  assert.equal(codes(missing).includes('TRUSTED_CONTEXT_MANIFEST_REQUIRED'), true);
  for (const [field, code] of [
    ['expectedSources', 'EMPTY_TRUSTED_EXPECTED_SOURCES'],
    ['mandatorySourceIds', 'EMPTY_TRUSTED_MANDATORY_SOURCES']
  ]) {
    const result = evaluateContextAdmission({ handoff, contextPolicy: config, trustedManifest: trustedManifest({ [field]: [] }), receipt: receipt(), sourceVerifier: trustedSource });
    assert.equal(result.allowed, false);
    assert.equal(codes(result).includes(code), true);
  }
  const noCoverage = evaluateContextAdmission({ handoff, contextPolicy: config, trustedManifest: trustedManifest({ requirementIds: [], acceptanceIds: [] }), receipt: receipt(), sourceVerifier: trustedSource });
  assert.equal(codes(noCoverage).includes('EMPTY_TRUSTED_COVERAGE_REQUIREMENTS'), true);
  const drift = evaluateContextAdmission({ handoff, contextPolicy: config, trustedManifest: trustedManifest({ headSha: 'e'.repeat(40) }), receipt: receipt(), sourceVerifier: trustedSource });
  assert.equal(codes(drift).includes('TRUSTED_CONTEXT_MANIFEST_DRIFT'), true);
});

test('receipt source content must match producer-pinned hashes', () => {
  const otherSha = createHash('sha256').update('# other\n').digest('hex');
  const swapped = { ...source, sha256: otherSha, content: '# other\n', consumption: { fullSource: true, sourceSha256: otherSha } };
  const result = evaluateContextAdmission({
    handoff, contextPolicy: config, trustedManifest: trustedManifest(), receipt: receipt({ sources: [swapped] }),
    sourceVerifier: current => ({ ...trustedSource(current), content: '# other\n', consumption: { fullSource: true, sourceSha256: otherSha } })
  });
  assert.equal(result.allowed, false);
  assert.equal(codes(result).includes('CONTEXT_SOURCE_MANIFEST_MISMATCH'), true);
});

test('assembled context digest must be present and match the trusted producer digest', () => {
  const omitted = evaluateContextAdmission({ handoff, contextPolicy: config, trustedManifest: trustedManifest(), receipt: receipt({ assembledContextSha256: undefined }), sourceVerifier: trustedSource });
  assert.equal(codes(omitted).includes('INVALID_CONTEXT_RECEIPT_DIGEST'), true);
  const malformed = evaluateContextAdmission({ handoff, contextPolicy: config, trustedManifest: trustedManifest(), receipt: receipt({ assembledContextSha256: 'not-a-digest' }), sourceVerifier: trustedSource });
  assert.equal(codes(malformed).includes('INVALID_CONTEXT_RECEIPT_DIGEST'), true);
  const tampered = 'y'.repeat(40000);
  const selfDigest = createHash('sha256').update(tampered).digest('hex');
  const forged = evaluateContextAdmission({ handoff, contextPolicy: config, trustedManifest: trustedManifest(), receipt: receipt({ assembledContext: tampered, assembledContextSha256: selfDigest }), sourceVerifier: trustedSource });
  assert.equal(forged.allowed, false);
  assert.equal(codes(forged).includes('CONTEXT_RECEIPT_DIGEST_UNTRUSTED'), true);
});

test('runtime evidence cannot activate Context Policy v2', () => {
  const result = evaluateTaskAction({ handoff, runtime: runtime({ contextPolicy: config }), action: executeAction, contextManifest: trustedManifest() });
  assert.equal(result.allowed, false);
  assert.equal(codes(result).includes('CONTEXT_V2_NOT_ACTIVATED'), true);
});

test('trusted manifest for another repository cannot admit the handoff', () => {
  const result = evaluateContextAdmission({ handoff, contextPolicy: config, trustedManifest: trustedManifest({ repository: 'evil/fork' }), receipt: receipt(), sourceVerifier: trustedSource });
  assert.equal(result.allowed, false);
  assert.equal(codes(result).includes('TRUSTED_CONTEXT_MANIFEST_DRIFT'), true);
});

test('v1 receipt runtime blocks are reflected in the admission decision', () => {
  const v1Handoff = { ...handoff, contextPolicyVersion: 1, assembledContextBudgetBytes: 32768, assembledContextActualBytes: 5 };
  const v1Receipt = {
    contextPolicyVersion: 1, assembledContext: 'hello', assembledContextActualBytes: 5,
    assembledContextBudgetBytes: 32768, assembledContextCheck: 'PASSED',
    runtime: { status: 'MEASURED', usedTokens: 1, capacityTokens: 2, reserveTokens: 1, reliable: false, trustedAdapter: true }
  };
  const unreliable = evaluateContextAdmission({ handoff: v1Handoff, receipt: v1Receipt });
  assert.equal(codes(unreliable).includes('UNRELIABLE_RUNTIME_METRICS'), true);
  assert.equal(unreliable.allowed, false);
  const compaction = evaluateContextAdmission({ handoff: v1Handoff, receipt: { ...v1Receipt, runtime: { status: 'UNMEASURED' }, compactionRequired: true } });
  assert.equal(codes(compaction).includes('UNSUPPORTED_COMPACTION'), true);
  assert.equal(compaction.allowed, false);
});
