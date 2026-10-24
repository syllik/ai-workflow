import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createTrustedSourceVerifier, evaluateContextAdmission, recoverContextAdmission } from '../scripts/workspace/context-admission.mjs';
import { approvalScopeDigest } from '../scripts/workspace/context-policy.mjs';
import { buildTaskContextPackage } from '../scripts/workspace/context-producer.mjs';
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
const handoff = {
  contractVersion: 2, taskId: 'syllik/ai-workflow#64', repository: 'syllik/ai-workflow',
  taskBranch, integrationBranch: 'master', requiredCiChecks: ['verify'], role: 'executor',
  policySha: sha, baseSha, headSha, contextPolicyVersion: 2,
  approval: { reference: 'https://github.com/syllik/ai-workflow/issues/64#issuecomment-6273710738', allowedPaths: ['scripts/workspace/**', 'test/**'], publication: 'allowed', maxCorrectionBatches: 2 },
  assembledContextActualBytes: 40000, assembledContextCheck: 'PASSED'
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
    contextPolicyVersion: 2, repository: handoff.repository, taskId: handoff.taskId,
    approval: { reference: handoff.approval.reference, scopeSha256: approvalScopeDigest(handoff.approval) },
    policySha: sha, baseSha, headSha,
    expectedSources: [{ kind: source.kind, repository: source.repository, path: source.path, revisionSha: sha }],
    mandatorySourceIds: [sourceId], requirementIds: ['I0'], acceptanceIds: ['A1'], dependencies: [],
    sources: [expectedSource], assembledContextSha256,
    assembledContextActualBytes: 40000, assembledContextCheck: 'PASSED',
    ...overrides
  };
}
function receipt(overrides = {}) {
  return {
    contextPolicyVersion: 2, taskId: handoff.taskId, policySha: sha, baseSha, headSha, repository: handoff.repository,
    assembledContext, assembledContextSha256, assembledContextActualBytes: 40000,
    assembledContextCheck: 'PASSED',
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
    ...overrides
  };
}
const executeAction = { kind: 'execute', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: [] };
const codes = result => result.findings.map(({ code }) => code);
function taskAction(overrides = {}) {
  return {
    handoff, runtime: runtime(), action: executeAction,
    contextManifest: trustedManifest(), contextSourceVerifier: trustedSource, ...overrides
  };
}

test('real evaluateTaskAction admits verified v2 context with trusted evidence and no byte cap', () => {
  const result = evaluateTaskAction(taskAction());
  assert.equal(result.allowed, true);
  assert.deepEqual(result.findings, []);
});

test('verified v2 requires Task Contract v2 and never falls back to basic v1', () => {
  const result = evaluateContextAdmission({ handoff: { ...handoff, contractVersion: 1 }, trustedManifest: trustedManifest(), receipt: receipt(), sourceVerifier: trustedSource });
  assert.equal(result.allowed, false);
  assert.equal(result.version, 2);
  assert.equal(result.findings.some(({ code }) => code === 'TASK_CONTEXT_VERSION_MISMATCH'), true);
});

test('unauthorized source evidence produces zero loader calls', () => {
  let calls = 0;
  const unauthorized = { ...source, repository: 'evil.example/impersonator', path: 'secret.md' };
  const result = evaluateContextAdmission({
    handoff, trustedManifest: trustedManifest(),
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
      handoff, trustedManifest: trustedManifest(),
      receipt: { assembledContextSha256: 'a'.repeat(64) },
      sourceVerifier: trustedSource
    });
  });
  assert.equal(result.allowed, false);
});

test('false coverage, stale identity and unreliable runtime are blocked', () => {
  const falseCoverage = evaluateContextAdmission({ handoff, trustedManifest: trustedManifest(), receipt: receipt({ sources: [{ ...source, coveredRequirements: ['I1'] }] }), sourceVerifier: trustedSource });
  assert.equal(falseCoverage.allowed, false);
  assert.equal(falseCoverage.findings.some(({ code }) => code === 'UNVERIFIED_SOURCE_COVERAGE'), true);
  const stale = evaluateContextAdmission({ handoff, trustedManifest: trustedManifest(), receipt: receipt({ headSha: 'e'.repeat(40) }), sourceVerifier: trustedSource });
  assert.equal(stale.allowed, false);
  const unreliable = evaluateContextAdmission({ handoff, trustedManifest: trustedManifest(), receipt: receipt(), runtime: { status: 'MEASURED', usedTokens: 1, capacityTokens: 2, reserveTokens: 1, reliable: false, trustedAdapter: true }, sourceVerifier: trustedSource });
  assert.equal(unreliable.allowed, false);
  assert.equal(unreliable.findings.some(({ code }) => code === 'UNRELIABLE_RUNTIME_METRICS'), true);
});

test('checkpoint recovery re-runs canonical admission and derives revalidation itself', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ai-workflow-context-admission-'));
  const secret = 'trusted checkpoint secret held outside agent context';
  const checkpointStore = createContextCheckpointStore({ directory, secretProvider: () => secret });
  const checkpointPayload = {
    taskId: handoff.taskId, contractVersion: 2, contextPolicyVersion: 2, policySha: sha, baseSha, headSha,
    repository: handoff.repository, approval: handoff.approval, allowedPaths: handoff.approval.allowedPaths,
    sources: [expectedSource], requirementCoverage: ['I0'],
    completedWork: [], pendingWork: ['resume'], validationEvidence: ['local-admission-test']
  };
  assert.equal((await checkpointStore.save('issue-64', checkpointPayload, { sequence: 1 })).valid, true);
  const recovered = await recoverContextAdmission({ store: checkpointStore, checkpointId: 'issue-64', taskAction: taskAction() });
  assert.equal(recovered.allowed, true);
  const otherRepository = await recoverContextAdmission({
    store: checkpointStore, checkpointId: 'issue-64',
    taskAction: taskAction({ handoff: { ...handoff, repository: 'other/repo' } })
  });
  assert.equal(otherRepository.allowed, false);
  const otherTask = await recoverContextAdmission({
    store: checkpointStore, checkpointId: 'issue-64',
    taskAction: taskAction({
      handoff: { ...handoff, taskId: 'syllik/ai-workflow#999' },
      runtime: runtime({ contextReceipt: receipt({ taskId: 'syllik/ai-workflow#999' }) }),
      contextManifest: trustedManifest({ taskId: 'syllik/ai-workflow#999' })
    })
  });
  assert.equal(otherTask.allowed, false);
  assert.equal(codes(otherTask).includes('CHECKPOINT_TASK_MISMATCH'), true);
  const noManifest = await recoverContextAdmission({ store: checkpointStore, checkpointId: 'issue-64', taskAction: taskAction({ contextManifest: undefined }) });
  assert.equal(noManifest.allowed, false);
});


test('receipt-supplied empty coverage sets cannot bypass the trusted manifest', () => {
  const emptyReceipt = receipt({ sources: [], expectedSources: [], mandatorySourceIds: [], requirementIds: [], acceptanceIds: [], declaredDependencies: [] });
  const result = evaluateTaskAction(taskAction({ runtime: runtime({ contextReceipt: emptyReceipt }) }));
  assert.equal(result.allowed, false);
  assert.equal(codes(result).includes('MISSING_MANDATORY_SOURCE'), true);
});

test('v2 admission requires a trusted producer manifest with non-empty required sets', () => {
  const missing = evaluateTaskAction(taskAction({ contextManifest: undefined }));
  assert.equal(missing.allowed, false);
  assert.equal(codes(missing).includes('TRUSTED_CONTEXT_MANIFEST_REQUIRED'), true);
  for (const [field, code] of [
    ['expectedSources', 'EMPTY_TRUSTED_EXPECTED_SOURCES'],
    ['mandatorySourceIds', 'EMPTY_TRUSTED_MANDATORY_SOURCES']
  ]) {
    const result = evaluateContextAdmission({ handoff, trustedManifest: trustedManifest({ [field]: [] }), receipt: receipt(), sourceVerifier: trustedSource });
    assert.equal(result.allowed, false);
    assert.equal(codes(result).includes(code), true);
  }
  const noCoverage = evaluateContextAdmission({ handoff, trustedManifest: trustedManifest({ requirementIds: [], acceptanceIds: [] }), receipt: receipt(), sourceVerifier: trustedSource });
  assert.equal(codes(noCoverage).includes('EMPTY_TRUSTED_COVERAGE_REQUIREMENTS'), true);
  const drift = evaluateContextAdmission({ handoff, trustedManifest: trustedManifest({ headSha: 'e'.repeat(40) }), receipt: receipt(), sourceVerifier: trustedSource });
  assert.equal(codes(drift).includes('TRUSTED_CONTEXT_MANIFEST_DRIFT'), true);
});

test('receipt source content must match producer-pinned hashes', () => {
  const otherSha = createHash('sha256').update('# other\n').digest('hex');
  const swapped = { ...source, sha256: otherSha, content: '# other\n', consumption: { fullSource: true, sourceSha256: otherSha } };
  const result = evaluateContextAdmission({
    handoff, trustedManifest: trustedManifest(), receipt: receipt({ sources: [swapped] }),
    sourceVerifier: current => ({ ...trustedSource(current), content: '# other\n', consumption: { fullSource: true, sourceSha256: otherSha } })
  });
  assert.equal(result.allowed, false);
  assert.equal(codes(result).includes('CONTEXT_SOURCE_MANIFEST_MISMATCH'), true);
});

test('assembled context digest must be present and match the trusted producer digest', () => {
  const omitted = evaluateContextAdmission({ handoff, trustedManifest: trustedManifest(), receipt: receipt({ assembledContextSha256: undefined }), sourceVerifier: trustedSource });
  assert.equal(codes(omitted).includes('INVALID_CONTEXT_RECEIPT_DIGEST'), true);
  const malformed = evaluateContextAdmission({ handoff, trustedManifest: trustedManifest(), receipt: receipt({ assembledContextSha256: 'not-a-digest' }), sourceVerifier: trustedSource });
  assert.equal(codes(malformed).includes('INVALID_CONTEXT_RECEIPT_DIGEST'), true);
  const tampered = 'y'.repeat(40000);
  const selfDigest = createHash('sha256').update(tampered).digest('hex');
  const forged = evaluateContextAdmission({ handoff, trustedManifest: trustedManifest(), receipt: receipt({ assembledContext: tampered, assembledContextSha256: selfDigest }), sourceVerifier: trustedSource });
  assert.equal(forged.allowed, false);
  assert.equal(codes(forged).includes('CONTEXT_RECEIPT_DIGEST_UNTRUSTED'), true);
});

test('verified v2 cannot be admitted without the trusted producer manifest', () => {
  const result = evaluateTaskAction(taskAction({ contextManifest: undefined }));
  assert.equal(result.allowed, false);
  assert.equal(codes(result).includes('TRUSTED_CONTEXT_MANIFEST_REQUIRED'), true);
});

test('trusted manifest for another repository cannot admit the handoff', () => {
  const result = evaluateContextAdmission({ handoff, trustedManifest: trustedManifest({ repository: 'evil/fork' }), receipt: receipt(), sourceVerifier: trustedSource });
  assert.equal(result.allowed, false);
  assert.equal(codes(result).includes('TRUSTED_CONTEXT_MANIFEST_DRIFT'), true);
});

test('v1 receipt runtime blocks are reflected in the admission decision', () => {
  const v1Handoff = { ...handoff, contextPolicyVersion: 1, assembledContextActualBytes: 5 };
  const v1Receipt = {
    contextPolicyVersion: 1, assembledContext: 'hello', assembledContextActualBytes: 5,
    assembledContextCheck: 'PASSED',
    runtime: { status: 'MEASURED', usedTokens: 1, capacityTokens: 2, reserveTokens: 1, reliable: false, trustedAdapter: true }
  };
  const unreliable = evaluateContextAdmission({ handoff: v1Handoff, receipt: v1Receipt, runtime: v1Receipt.runtime });
  assert.equal(codes(unreliable).includes('UNRELIABLE_RUNTIME_METRICS'), true);
  assert.equal(unreliable.allowed, false);
  const compaction = evaluateContextAdmission({ handoff: v1Handoff, receipt: v1Receipt, runtime: { status: 'UNMEASURED', compactionRequired: true } });
  assert.equal(codes(compaction).includes('UNSUPPORTED_COMPACTION'), true);
  assert.equal(compaction.allowed, false);
});

test('evidence produced for one task, approval or scope never admits another', () => {
  const otherTask = { ...handoff, taskId: 'syllik/ai-workflow#999' };
  const byTask = evaluateTaskAction(taskAction({ handoff: otherTask, runtime: runtime({ contextReceipt: receipt({ taskId: otherTask.taskId }) }) }));
  assert.equal(byTask.allowed, false);
  assert.equal(byTask.findings.some(({ code, path }) => code === 'TRUSTED_CONTEXT_MANIFEST_DRIFT' && path === 'trustedManifest.taskId'), true);
  const broader = { ...handoff, approval: { ...handoff.approval, allowedPaths: ['**'] } };
  const byScope = evaluateContextAdmission({ handoff: broader, trustedManifest: trustedManifest(), receipt: receipt(), sourceVerifier: trustedSource });
  assert.equal(byScope.allowed, false);
  assert.equal(byScope.findings.some(({ path }) => path === 'trustedManifest.approval'), true);
  const byReceipt = evaluateContextAdmission({ handoff, trustedManifest: trustedManifest(), receipt: receipt({ taskId: 'syllik/ai-workflow#999' }), sourceVerifier: trustedSource });
  assert.equal(codes(byReceipt).includes('CONTEXT_RECEIPT_DRIFT'), true);
});


test('receipt-claimed runtime capacity and compaction are ignored', () => {
  const claimed = evaluateContextAdmission({
    handoff, trustedManifest: trustedManifest(), sourceVerifier: trustedSource,
    receipt: receipt({ runtime: { status: 'MEASURED', usedTokens: 1, capacityTokens: 1000000, reserveTokens: 1, reliable: true, trustedAdapter: true }, compactionCapabilities: { nativeCompaction: 'SUPPORTED', trustedAdapter: true } })
  });
  assert.equal(claimed.runtime.status, 'UNMEASURED');
  assert.equal(claimed.runtime.compaction.action, 'VERIFIED_CHECKPOINT_RESTART');
  const nearCapacity = evaluateTaskAction(taskAction({ contextRuntime: { status: 'MEASURED', usedTokens: 90, capacityTokens: 100, reserveTokens: 20, reliable: true, trustedAdapter: true } }));
  assert.equal(codes(nearCapacity).includes('RUNTIME_CAPACITY_INSUFFICIENT'), true);
});

test('the source verifier is a trusted top-level input, not runtime evidence', () => {
  const result = evaluateTaskAction(taskAction({ contextSourceVerifier: undefined, runtime: runtime({ contextSourceVerifier: trustedSource }) }));
  assert.equal(result.allowed, false);
  assert.equal(codes(result).includes('TRUSTED_CONTEXT_VERIFIER_REQUIRED'), true);
});

// End-to-end: real producer output -> trusted verifier -> canonical evaluateTaskAction().
const e2ePolicySha = '1'.repeat(40);
const e2eHeadSha = '2'.repeat(40);
const e2eBaseSha = '3'.repeat(40);
const e2eFiles = [
  { kind: 'policy', repository: 'syllik/ai-workflow', path: 'AI.md', content: '# entry\n' },
  { kind: 'policy', repository: 'syllik/ai-workflow', path: 'FLOW.md', content: '# flow\n' },
  { kind: 'policy', repository: 'syllik/ai-workflow', path: 'global/documentation.md', content: '# documentation\n' },
  { kind: 'policy', repository: 'syllik/ai-workflow', path: 'workspace.yaml', content: [
    'schemaVersion: 2', 'projects:',
    '  - id: syllik/life-ops-bot', '    repository: syllik/life-ops-bot', '    access: managed', '    status: active', ''
  ].join('\n') },
  { kind: 'policy', repository: 'syllik/ai-workflow', path: 'projects/index.md', content: '# projects\n' },
  { kind: 'policy', repository: 'syllik/ai-workflow', path: 'global/workflow.md', content: '# roles\n' },
  { kind: 'role', repository: 'syllik/ai-workflow', path: 'global/executor.md', content: '# executor\n' },
  { kind: 'target', repository: 'syllik/life-ops-bot', path: 'AGENTS.md', content: '# rules\n' },
  { kind: 'target', repository: 'syllik/life-ops-bot', path: '.ai/context.md', content: '# context\nBOT-001 must stay fail-closed.\n' }
].map(file => ({ ...file, revisionSha: ['policy', 'role'].includes(file.kind) ? e2ePolicySha : e2eHeadSha }));
const blobOf = content => createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0${content}`).digest('hex');
const e2eLoader = source => {
  const file = e2eFiles.find(f => f.repository.toLowerCase() === source.repository.toLowerCase() && f.path === source.path && f.revisionSha === source.revisionSha);
  if (!file) throw new Error('unknown source');
  return { content: file.content, blobSha: blobOf(file.content) };
};
const e2eHandoffBase = {
  contractVersion: 2, taskId: 'syllik/life-ops-bot#1', repository: 'syllik/life-ops-bot',
  taskBranch: 'feat/bot-1', integrationBranch: 'master', requiredCiChecks: ['verify'], role: 'executor',
  policySha: e2ePolicySha, baseSha: e2eBaseSha, headSha: e2eHeadSha, contextPolicyVersion: 2,
  approval: { reference: 'owner-approval', allowedPaths: ['src/**'], publication: 'allowed', maxCorrectionBatches: 2 }
};
function produceE2E(overrides = {}) {
  const input = {
    role: 'executor', repository: e2eHandoffBase.repository, taskId: e2eHandoffBase.taskId, approval: e2eHandoffBase.approval,
    contractVersion: 2, contextPolicyVersion: 2, policySha: e2ePolicySha, baseSha: e2eBaseSha, headSha: e2eHeadSha,
    acceptance: { text: 'y'.repeat(33000) }, requirementIds: ['BOT-001'],
    expectedSources: e2eFiles.map(({ kind, repository, path: filePath, revisionSha }) => ({ kind, repository, path: filePath, revisionSha })),
    dependencies: [],
    sources: e2eFiles.map(({ kind, repository, path: filePath, revisionSha }) => ({ kind, repository, path: filePath, revisionSha, expectedRevisionSha: revisionSha })),
    ...overrides
  };
  for (const [key, value] of Object.entries(input)) if (value === undefined) delete input[key];
  return buildTaskContextPackage(input, { sourceLoader: e2eLoader, integrationBranchResolver: () => { throw new Error('no dependencies'); } });
}
function e2eTaskAction(produced, { delivered = produced.manifest.sources } = {}) {
  const deliveries = new Map(delivered.map(s => [`${s.repository.toLowerCase()}@${s.revisionSha}:${s.path}`, s.sha256]));
  const verifier = createTrustedSourceVerifier({ loadSource: e2eLoader, deliveries, requirementIds: produced.manifest.requirementIds, acceptanceIds: produced.manifest.acceptanceIds });
  const handoff2 = { ...e2eHandoffBase, ...produced.handoffProvenance };
  const receiptSources = produced.manifest.sources.map(s => {
    const attested = verifier(s);
    return { kind: s.kind, repository: s.repository, path: s.path, revisionSha: s.revisionSha, blobSha: s.blobSha, sha256: s.sha256, state: 'COVERED', consumption: { fullSource: true, sourceSha256: s.sha256 }, coveredRequirements: attested?.coveredRequirements ?? [], coveredAcceptance: [] };
  });
  return {
    handoff: handoff2,
    runtime: {
      currentRepository: handoff2.repository, currentPolicySha: e2ePolicySha, currentBaseSha: e2eBaseSha,
      currentHeadSha: e2eHeadSha, currentBranch: handoff2.taskBranch,
      workspaceRecord: { repository: handoff2.repository, access: 'managed', status: 'active', integrationBranch: 'master' },
      diffEvidence: { baseSha: e2eBaseSha, headSha: e2eHeadSha, changedPaths: [] },
      contextReceipt: {
        contextPolicyVersion: 2, taskId: handoff2.taskId, policySha: e2ePolicySha, baseSha: e2eBaseSha, headSha: e2eHeadSha, repository: handoff2.repository,
        assembledContext: produced.assembledContext, assembledContextSha256: produced.manifest.assembledContextSha256,
        assembledContextActualBytes: produced.manifest.assembledContextActualBytes, assembledContextCheck: 'PASSED',
        sources: receiptSources
      }
    },
    action: { kind: 'execute', actorRole: 'executor', expectedHeadSha: e2eHeadSha, changedPaths: [] },
    contextManifest: produced.manifest,
    contextSourceVerifier: verifier
  };
}

test('acceptance 2: large real producer output passes canonical admission with the trusted verifier and no runtime adapter', () => {
  const produced = produceE2E();
  assert.equal(produced.passed, true, JSON.stringify(produced.findings));
  assert.equal(produced.manifest.assembledContextActualBytes > 33000, true);
  assert.equal(Object.hasOwn(produced.manifest, 'contextPolicy'), false);
  const result = evaluateTaskAction(e2eTaskAction(produced));
  assert.deepEqual(result.findings, []);
  assert.equal(result.allowed, true);
});

test('trusted verifier withholds consumption for content the runner did not deliver in full', () => {
  const produced = produceE2E();
  const result = evaluateTaskAction(e2eTaskAction(produced, { delivered: produced.manifest.sources.filter(s => s.path !== 'FLOW.md') }));
  assert.equal(result.allowed, false);
  assert.equal(codes(result).includes('UNVERIFIED_SOURCE_CONSUMPTION'), true);
});

test('verified v2 is unavailable for a target that is no longer an active managed project', () => {
  const onboarding = file => file.path === 'workspace.yaml' ? { ...file, content: file.content.replace('status: active', 'status: onboarding') } : file;
  const produced = buildTaskContextPackage({
    role: 'executor', ...e2eHandoffBase, acceptance: { text: 'short' }, requirementIds: ['BOT-001'],
    expectedSources: e2eFiles.map(({ kind, repository, path: filePath, revisionSha }) => ({ kind, repository, path: filePath, revisionSha })),
    dependencies: [],
    sources: e2eFiles.map(f => ({ kind: f.kind, repository: f.repository, path: f.path, revisionSha: f.revisionSha, expectedRevisionSha: f.revisionSha }))
  }, { sourceLoader: s => onboarding({ path: s.path, ...e2eLoader(s) }) });
  assert.equal(produced.passed, false);
  assert.equal(codes(produced).includes('CONTEXT_TARGET_NOT_MANAGED'), true);
});

test('acceptance 12: a fresh provider-neutral session resumes from a new store instance without any runtime adapter', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ai-workflow-context-resume-'));
  const secretProvider = () => 'trusted checkpoint secret held outside agent context';
  const produced = produceE2E();
  const action = e2eTaskAction(produced);
  const payload = {
    taskId: action.handoff.taskId, contractVersion: 2, contextPolicyVersion: 2,
    policySha: e2ePolicySha, baseSha: e2eBaseSha, headSha: e2eHeadSha, repository: action.handoff.repository,
    approval: action.handoff.approval, allowedPaths: action.handoff.approval.allowedPaths,
    sources: produced.manifest.sources.map(({ kind, repository, path: p, revisionSha, blobSha, sha256 }) => ({ kind, repository, path: p, revisionSha, blobSha, sha256 })),
    requirementCoverage: produced.manifest.requirementIds, completedWork: ['step 1'], pendingWork: ['step 2'], validationEvidence: ['e2e']
  };
  assert.equal((await createContextCheckpointStore({ directory, secretProvider }).save('bot-1', payload, { sequence: 1 })).valid, true);
  const freshSession = createContextCheckpointStore({ directory, secretProvider });
  const resumed = await recoverContextAdmission({ store: freshSession, checkpointId: 'bot-1', taskAction: e2eTaskAction(produceE2E()) });
  assert.equal(resumed.allowed, true, JSON.stringify(resumed.findings));
  assert.equal(resumed.checkpoint.payload.pendingWork[0], 'step 2');
});


test('manifest and handoff must agree on the context policy version', () => {
  const v1Handoff = { ...handoff, contextPolicyVersion: 1, assembledContextActualBytes: 5 };
  const result = evaluateContextAdmission({ handoff: v1Handoff, trustedManifest: trustedManifest() });
  assert.equal(result.allowed, false);
  assert.equal(codes(result).includes('TRUSTED_CONTEXT_MANIFEST_VERSION_MISMATCH'), true);
});

test('a new Task Contract v2 task resolved to verified v2 carries its version into the handoff', () => {
  const { contextPolicyVersion: _v, ...unversioned } = e2eHandoffBase;
  const produced = produceE2E({ contextPolicyVersion: undefined, newTask: true });
  assert.equal(produced.passed, true, JSON.stringify(produced.findings));
  assert.equal(produced.handoffProvenance.contextPolicyVersion, 2);
  const action = e2eTaskAction(produced);
  const result = evaluateTaskAction({ ...action, handoff: { ...unversioned, ...produced.handoffProvenance } });
  assert.equal(result.allowed, true, JSON.stringify(result.findings));
});

test('trusted coverage matches whole requirement IDs only', () => {
  const content = '| AC-1.2 | covered. Sentence ends with AC-3. Pair R1/R2. Prefix XR9 and R9X.\n';
  const id = `a/b@${'c'.repeat(40)}:f.md`;
  const verifier = createTrustedSourceVerifier({
    loadSource: () => ({ content, blobSha: 'b'.repeat(40) }),
    deliveries: new Map([[id, createHash('sha256').update(content).digest('hex')]]),
    requirementIds: ['AC-1', 'AC-1.2', 'AC-3', 'R1', 'R2', 'R9'], acceptanceIds: []
  });
  assert.deepEqual(verifier({ repository: 'a/b', revisionSha: 'c'.repeat(40), path: 'f.md' }).coveredRequirements, ['AC-1.2', 'AC-3', 'R1', 'R2']);
});

test('acceptance 9: a rollback published at a new policySha pauses the pinned v2 handoff', () => {
  const produced = produceE2E();
  const pinned = e2eTaskAction(produced);
  const rolledBackPolicySha = '4'.repeat(40);
  const resumed = evaluateTaskAction({ ...pinned, runtime: { ...pinned.runtime, currentPolicySha: rolledBackPolicySha } });
  assert.equal(resumed.allowed, false);
  assert.equal(resumed.findings.some(({ code }) => /POLICY_SHA/u.test(code)), true);
});
