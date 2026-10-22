import { createHash } from 'node:crypto';
import {
  CONTEXT_POLICY_BASIC,
  CONTEXT_POLICY_VERIFIED,
  approvalScopeDigest,
  assessRuntime,
  chooseCompaction,
  evaluateContextBytes,
  resolveContextPolicy,
  validateContextCoverage
} from './context-policy.mjs';
// Cyclic by design: recovery must re-run the single canonical admission.
import { evaluateTaskAction } from './task-policy.mjs';

const SHA40 = /^[0-9a-f]{40}$/u;
const SHA64 = /^[0-9a-f]{64}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finding(code, path, details = {}) {
  return { code, path, ...details };
}

function sameRepository(left, right) {
  return typeof left === 'string'
    && typeof right === 'string'
    && left.trim().toLowerCase() === right.trim().toLowerCase();
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function compareReceiptIdentity(receipt, handoff, findings) {
  for (const field of ['taskId', 'policySha', 'baseSha', 'headSha']) {
    if (receipt[field] !== handoff[field]) findings.push(finding('CONTEXT_RECEIPT_DRIFT', `receipt.${field}`));
  }
  if (!sameRepository(receipt.repository, handoff.repository)) {
    findings.push(finding('CONTEXT_RECEIPT_DRIFT', 'receipt.repository'));
  }
}

function validateReceiptShape(receipt, handoff, version, findings) {
  if (version === CONTEXT_POLICY_BASIC && receipt === undefined) return;
  if (!isRecord(receipt)) {
    findings.push(finding('CONTEXT_RECEIPT_REQUIRED', 'runtime.contextReceipt'));
    return;
  }
  if (receipt.contextPolicyVersion !== version) {
    findings.push(finding('CONTEXT_RECEIPT_VERSION_MISMATCH', 'receipt.contextPolicyVersion'));
  }
  if (version === CONTEXT_POLICY_VERIFIED) compareReceiptIdentity(receipt, handoff, findings);
}

function validateAggregateReceipt(receipt, handoff, version, findings) {
  if (!isRecord(receipt)) return;
  const measured = evaluateContextBytes(receipt.assembledContext);
  findings.push(...measured.findings.map(item => ({ ...item, path: `receipt.${item.path}` })));
  if (Number.isInteger(receipt.assembledContextActualBytes) && receipt.assembledContextActualBytes !== measured.actualBytes) {
    findings.push(finding('CONTEXT_RECEIPT_BYTE_MISMATCH', 'receipt.assembledContextActualBytes'));
  }
  if (receipt.assembledContextCheck !== 'PASSED') {
    findings.push(finding('CONTEXT_RECEIPT_NOT_PASSED', 'receipt.assembledContextCheck'));
  }
  const validDigest = typeof receipt.assembledContextSha256 === 'string' && SHA64.test(receipt.assembledContextSha256);
  if (version === CONTEXT_POLICY_VERIFIED && !validDigest) {
    findings.push(finding('INVALID_CONTEXT_RECEIPT_DIGEST', 'receipt.assembledContextSha256'));
  }
  if (typeof receipt.assembledContext === 'string' && validDigest
    && sha256(receipt.assembledContext) !== receipt.assembledContextSha256) {
    findings.push(finding('CONTEXT_RECEIPT_HASH_MISMATCH', 'receipt.assembledContextSha256'));
  }
  if (version === CONTEXT_POLICY_VERIFIED) {
    if (receipt.assembledContextActualBytes !== handoff.assembledContextActualBytes) {
      findings.push(finding('CONTEXT_RECEIPT_HANDOFF_MISMATCH', 'receipt.assembledContextActualBytes'));
    }
    if (receipt.assembledContextCheck !== handoff.assembledContextCheck) {
      findings.push(finding('CONTEXT_RECEIPT_HANDOFF_MISMATCH', 'receipt.assembledContextCheck'));
    }
  }
}

// Coverage authority comes from the trusted producer manifest, never from the receipt
// being evaluated. Producer source hashes bind each expected source to exact content.
function trustedCoverageEnvelope(manifest, receipt, handoff, findings) {
  if (!isRecord(manifest)) {
    findings.push(finding('TRUSTED_CONTEXT_MANIFEST_REQUIRED', 'trustedManifest'));
    return null;
  }
  if (manifest.contextPolicyVersion !== CONTEXT_POLICY_VERIFIED) {
    findings.push(finding('TRUSTED_CONTEXT_MANIFEST_VERSION_MISMATCH', 'trustedManifest.contextPolicyVersion'));
  }
  for (const field of ['policySha', 'baseSha', 'headSha']) {
    if (manifest[field] !== handoff[field]) findings.push(finding('TRUSTED_CONTEXT_MANIFEST_DRIFT', `trustedManifest.${field}`));
  }
  if (!sameRepository(manifest.repository, handoff.repository)) {
    findings.push(finding('TRUSTED_CONTEXT_MANIFEST_DRIFT', 'trustedManifest.repository'));
  }
  // Evidence produced for one task, approval or scope never admits another.
  if (typeof manifest.taskId !== 'string' || manifest.taskId !== handoff.taskId) {
    findings.push(finding('TRUSTED_CONTEXT_MANIFEST_DRIFT', 'trustedManifest.taskId'));
  }
  const scopeSha256 = approvalScopeDigest(handoff.approval);
  if (!isRecord(manifest.approval) || scopeSha256 === null
    || manifest.approval.reference !== handoff.approval?.reference
    || manifest.approval.scopeSha256 !== scopeSha256) {
    findings.push(finding('TRUSTED_CONTEXT_MANIFEST_DRIFT', 'trustedManifest.approval'));
  }
  if (manifest.assembledContextCheck !== 'PASSED') {
    findings.push(finding('TRUSTED_CONTEXT_MANIFEST_NOT_PASSED', 'trustedManifest.assembledContextCheck'));
  }
  if (manifest.assembledContextActualBytes !== handoff.assembledContextActualBytes) {
    findings.push(finding('TRUSTED_CONTEXT_MANIFEST_DRIFT', 'trustedManifest.assembledContextActualBytes'));
  }
  if (typeof manifest.assembledContextSha256 !== 'string' || !SHA64.test(manifest.assembledContextSha256)) {
    findings.push(finding('INVALID_TRUSTED_CONTEXT_DIGEST', 'trustedManifest.assembledContextSha256'));
  } else if (receipt.assembledContextSha256 !== manifest.assembledContextSha256) {
    findings.push(finding('CONTEXT_RECEIPT_DIGEST_UNTRUSTED', 'receipt.assembledContextSha256'));
  }

  const { expectedSources, mandatorySourceIds, requirementIds, acceptanceIds = [], dependencies = [], sources = [] } = manifest;
  if (!Array.isArray(expectedSources) || expectedSources.length === 0) {
    findings.push(finding('EMPTY_TRUSTED_EXPECTED_SOURCES', 'trustedManifest.expectedSources'));
  }
  if (!Array.isArray(mandatorySourceIds) || mandatorySourceIds.length === 0) {
    findings.push(finding('EMPTY_TRUSTED_MANDATORY_SOURCES', 'trustedManifest.mandatorySourceIds'));
  }
  if (!Array.isArray(requirementIds) || !Array.isArray(acceptanceIds) || requirementIds.length + acceptanceIds.length === 0) {
    findings.push(finding('EMPTY_TRUSTED_COVERAGE_REQUIREMENTS', 'trustedManifest.requirementIds'));
  }
  if (!Array.isArray(dependencies) || !Array.isArray(sources)) {
    findings.push(finding('INVALID_TRUSTED_CONTEXT_MANIFEST', 'trustedManifest'));
    return null;
  }
  if (!Array.isArray(expectedSources)) return null;

  const sourceKey = entry => `${String(entry?.repository).toLowerCase()}@${entry?.revisionSha}:${entry?.path}`;
  const producedById = new Map(sources.filter(isRecord).map(entry => [sourceKey(entry), entry]));
  return {
    sources: receipt.sources,
    expectedSources: expectedSources.map((entry) => {
      const produced = producedById.get(sourceKey(entry));
      return isRecord(entry) && produced ? { ...entry, blobSha: produced.blobSha, sha256: produced.sha256 } : entry;
    }),
    mandatorySourceIds,
    requirementIds,
    acceptanceIds,
    declaredDependencies: dependencies.map(dependency => dependency?.repository)
  };
}

// Runtime capacity and compaction come only from the trusted runtime adapter.
// Receipt-supplied metrics are agent claims and are ignored (treated as UNMEASURED).
function evaluateRuntime(runtime, findings) {
  const measurement = isRecord(runtime) && Object.hasOwn(runtime, 'status') ? runtime : null;
  const assessed = assessRuntime(measurement);
  findings.push(...assessed.findings);
  const compaction = chooseCompaction(measurement?.compactionCapabilities, { required: measurement?.compactionRequired === true });
  if (compaction.blocked) findings.push(finding('UNSUPPORTED_COMPACTION', 'runtime.compactionCapabilities'));
  return { ...assessed, compaction };
}

export function evaluateContextAdmission({
  handoff,
  receipt,
  trustedManifest,
  sourceVerifier,
  runtime = null
} = {}) {
  const findings = [];
  if (!isRecord(handoff)) return { allowed: false, version: null, findings: [finding('INVALID_HANDOFF', 'handoff')] };

  const resolved = resolveContextPolicy(handoff);
  findings.push(...resolved.findings);
  if (!resolved.admitted) return { allowed: false, version: resolved.version, findings };

  if (isRecord(trustedManifest) && trustedManifest.contextPolicyVersion !== resolved.version) {
    findings.push(finding('TRUSTED_CONTEXT_MANIFEST_VERSION_MISMATCH', 'trustedManifest.contextPolicyVersion'));
    return { allowed: false, version: resolved.version, findings };
  }

  const version = resolved.version;
  validateReceiptShape(receipt, handoff, version, findings);
  if (version === CONTEXT_POLICY_BASIC && receipt === undefined) {
    return { allowed: findings.length === 0, version, findings, runtime: { status: 'UNMEASURED' } };
  }
  if (!isRecord(receipt)) return { allowed: false, version, findings };

  validateAggregateReceipt(receipt, handoff, version, findings);
  if (version === CONTEXT_POLICY_BASIC) {
    // Runtime findings must be collected before deriving the decision.
    const runtimeAssessment = evaluateRuntime(runtime, findings);
    return { allowed: findings.length === 0, version, findings, runtime: runtimeAssessment };
  }

  if (typeof receipt.policySha !== 'string' || !SHA40.test(receipt.policySha)
    || typeof receipt.baseSha !== 'string' || !SHA40.test(receipt.baseSha)
    || typeof receipt.headSha !== 'string' || !SHA40.test(receipt.headSha)
    || typeof receipt.repository !== 'string' || !REPOSITORY.test(receipt.repository)) {
    findings.push(finding('INVALID_CONTEXT_RECEIPT_IDENTITY', 'receipt'));
  }
  if (typeof sourceVerifier !== 'function') {
    findings.push(finding('TRUSTED_CONTEXT_VERIFIER_REQUIRED', 'sourceVerifier'));
  }
  const coverage = trustedCoverageEnvelope(trustedManifest, receipt, handoff, findings);
  if (coverage) findings.push(...validateContextCoverage(coverage, sourceVerifier));

  const runtimeAssessment = evaluateRuntime(runtime, findings);
  return { allowed: findings.length === 0, version, findings, runtime: runtimeAssessment };
}

function checkpointSources(manifest) {
  return Array.isArray(manifest?.sources)
    ? manifest.sources.filter(isRecord).map(({ kind, repository, path, revisionSha, blobSha, sha256: sourceSha256 }) => (
      { kind, repository, path, revisionSha, blobSha, sha256: sourceSha256 }
    ))
    : null;
}

// Resume always re-runs the canonical evaluateTaskAction() with a freshly produced
// trusted manifest. The revalidation state is derived here, never supplied by a caller.
export async function recoverContextAdmission({ store, checkpointId, taskAction } = {}) {
  if (!store || typeof store.loadLatest !== 'function') {
    return { allowed: false, findings: [finding('CHECKPOINT_STORE_REQUIRED', 'store')] };
  }
  if (!isRecord(taskAction) || !isRecord(taskAction.handoff)) {
    return { allowed: false, findings: [finding('INVALID_RECOVERY_INPUT', 'taskAction')] };
  }
  const { handoff, contextManifest } = taskAction;
  if (!isRecord(contextManifest) || contextManifest.assembledContextCheck !== 'PASSED') {
    return { allowed: false, findings: [finding('TRUSTED_CONTEXT_MANIFEST_REQUIRED', 'taskAction.contextManifest')] };
  }
  const admitted = evaluateTaskAction(taskAction);
  if (!admitted.allowed) return { allowed: false, findings: admitted.findings };

  const sources = checkpointSources(contextManifest);
  const producedIds = new Set((sources ?? []).map(entry => `${String(entry.repository).toLowerCase()}@${entry.revisionSha}:${entry.path}`));
  const rehydrated = Array.isArray(contextManifest.mandatorySourceIds)
    && contextManifest.mandatorySourceIds.length > 0
    && contextManifest.mandatorySourceIds.every(id => producedIds.has(id));
  const current = {
    contractVersion: handoff.contractVersion,
    contextPolicyVersion: Object.hasOwn(handoff, 'contextPolicyVersion') ? handoff.contextPolicyVersion : CONTEXT_POLICY_BASIC,
    policySha: handoff.policySha,
    baseSha: handoff.baseSha,
    headSha: handoff.headSha,
    repository: handoff.repository,
    approval: handoff.approval,
    allowedPaths: handoff.approval?.allowedPaths,
    sources,
    requirementCoverage: contextManifest.requirementIds,
    freshAuthorityValidated: true,
    allMandatorySourcesRehydrated: rehydrated,
    coverageRevalidated: rehydrated
  };
  const restored = await store.loadLatest(checkpointId, { current });
  if (!restored.valid) return { allowed: false, findings: restored.findings, checkpoint: restored.checkpoint };
  if (restored.checkpoint?.payload?.taskId !== handoff.taskId) {
    return { allowed: false, findings: [finding('CHECKPOINT_TASK_MISMATCH', 'checkpoint.payload.taskId')], checkpoint: restored.checkpoint };
  }
  return { ...admitted, checkpoint: restored.checkpoint };
}

const REQUIREMENT_TOKEN_BOUNDARY = '[A-Za-z0-9_-]';
function containsExactId(content, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  // `AC-1` is not covered by `AC-1.2`, but a sentence-ending `AC-1.` still is.
  return new RegExp(`(?<!${REQUIREMENT_TOKEN_BOUNDARY}|[A-Za-z0-9]\\.)${escaped}(?!${REQUIREMENT_TOKEN_BOUNDARY}|\\.[A-Za-z0-9])`, 'u').test(content);
}

// Vendor-neutral trusted verifier (D2). `loadSource` is the trusted Git-object
// loader; `deliveries` is the trusted runner's ledger of sourceId -> sha256 for
// content it delivered to the agent in full. Coverage is computed from the
// verified Git content (exact ID tokens), never taken from the receipt.
export function createTrustedSourceVerifier({ loadSource, deliveries, requirementIds = [], acceptanceIds = [] } = {}) {
  if (typeof loadSource !== 'function' || !(deliveries instanceof Map)) {
    throw new Error('Trusted source loader and delivery ledger required');
  }
  return (source) => {
    const loaded = loadSource(source);
    if (!isRecord(loaded) || typeof loaded.content !== 'string' || typeof loaded.blobSha !== 'string') return null;
    const id = `${String(source.repository).toLowerCase()}@${source.revisionSha}:${source.path}`;
    const contentSha256 = sha256(loaded.content);
    const delivered = deliveries.get(id) === contentSha256;
    return {
      repository: source.repository,
      path: source.path,
      revisionSha: source.revisionSha,
      blobSha: loaded.blobSha,
      content: loaded.content,
      ...(delivered ? { consumption: { fullSource: true, sourceSha256: contentSha256 } } : {}),
      coveredRequirements: delivered ? requirementIds.filter(rid => containsExactId(loaded.content, rid)) : [],
      coveredAcceptance: delivered ? acceptanceIds.filter(aid => containsExactId(loaded.content, aid)) : []
    };
  };
}
