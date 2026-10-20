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
function receipt(overrides = {}) {
  return {
    contextPolicyVersion: 2, policySha: sha, baseSha, headSha, repository: handoff.repository,
    assembledContext: 'x'.repeat(40000), assembledContextActualBytes: 40000,
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
    contextPolicy: config, contextSourceVerifier: trustedSource, ...overrides
  };
}

test('real evaluateTaskAction admits activated v2 context above 32768 with trusted evidence', () => {
  const result = evaluateTaskAction({ handoff, runtime: runtime(), action: { kind: 'execute', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: [] }, contextPolicy: config });
  assert.equal(result.allowed, true);
  assert.deepEqual(result.findings, []);
});

test('disabled v2 admission fails closed without treating the handoff as v1', () => {
  const result = evaluateContextAdmission({ handoff, contextPolicy: { ...config, rolloutAllowlist: [] }, receipt: receipt(), sourceVerifier: trustedSource });
  assert.equal(result.allowed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_V2_NOT_ACTIVATED'), true);
});

test('unauthorized source evidence produces zero loader calls', () => {
  let calls = 0;
  const unauthorized = { ...source, repository: 'evil.example/impersonator', path: 'secret.md' };
  const result = evaluateContextAdmission({
    handoff, contextPolicy: config,
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
      handoff, contextPolicy: config,
      receipt: { assembledContextSha256: 'a'.repeat(64) },
      sourceVerifier: trustedSource
    });
  });
  assert.equal(result.allowed, false);
});

test('false coverage, stale identity and unreliable runtime are blocked', () => {
  const falseCoverage = evaluateContextAdmission({ handoff, contextPolicy: config, receipt: receipt({ sources: [{ ...source, coveredRequirements: ['I1'] }] }), sourceVerifier: trustedSource });
  assert.equal(falseCoverage.allowed, false);
  assert.equal(falseCoverage.findings.some(({ code }) => code === 'UNVERIFIED_SOURCE_COVERAGE'), true);
  const stale = evaluateContextAdmission({ handoff, contextPolicy: config, receipt: receipt({ headSha: 'e'.repeat(40) }), sourceVerifier: trustedSource });
  assert.equal(stale.allowed, false);
  const unreliable = evaluateContextAdmission({ handoff, contextPolicy: config, receipt: receipt({ runtime: { status: 'MEASURED', usedTokens: 1, capacityTokens: 2, reserveTokens: 1, reliable: false, trustedAdapter: true } }), sourceVerifier: trustedSource });
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
    handoff, contextPolicy: config, receipt: savedReceipt, sourceVerifier: trustedSource
  });
  assert.equal(recovered.allowed, true);
  const stale = await recoverContextAdmission({
    store: checkpointStore, checkpointId: 'issue-64', current: { ...current, coverageRevalidated: false },
    handoff, contextPolicy: config, receipt: savedReceipt, sourceVerifier: trustedSource
  });
  assert.equal(stale.allowed, false);
  assert.equal(stale.findings.some(({ code }) => code === 'CHECKPOINT_REVALIDATION_REQUIRED'), true);
});
