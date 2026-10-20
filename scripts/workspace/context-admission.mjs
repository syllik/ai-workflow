import { createHash } from 'node:crypto';
import {
  DEFAULT_CONTEXT_POLICY,
  assessRuntime,
  chooseCompaction,
  evaluateContextBytes,
  resolveContextPolicy,
  validateContextCoverage
} from './context-policy.mjs';

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
  for (const field of ['policySha', 'baseSha', 'headSha']) {
    if (receipt[field] !== handoff[field]) findings.push(finding('CONTEXT_RECEIPT_DRIFT', `receipt.${field}`));
  }
  if (!sameRepository(receipt.repository, handoff.repository)) {
    findings.push(finding('CONTEXT_RECEIPT_DRIFT', 'receipt.repository'));
  }
}

function validateReceiptShape(receipt, handoff, version, findings) {
  if (version === 1 && receipt === undefined) return;
  if (!isRecord(receipt)) {
    findings.push(finding('CONTEXT_RECEIPT_REQUIRED', 'runtime.contextReceipt'));
    return;
  }
  if (receipt.contextPolicyVersion !== version) {
    findings.push(finding('CONTEXT_RECEIPT_VERSION_MISMATCH', 'receipt.contextPolicyVersion'));
  }
  if (version === 2) compareReceiptIdentity(receipt, handoff, findings);
}

function validateAggregateReceipt(receipt, handoff, version, findings) {
  if (!isRecord(receipt)) return;
  const measured = evaluateContextBytes(version, receipt.assembledContext);
  findings.push(...measured.findings.map(item => ({ ...item, path: `receipt.${item.path}` })));
  if (Number.isInteger(receipt.assembledContextActualBytes) && receipt.assembledContextActualBytes !== measured.actualBytes) {
    findings.push(finding('CONTEXT_RECEIPT_BYTE_MISMATCH', 'receipt.assembledContextActualBytes'));
  }
  if (receipt.assembledContextBudgetBytes !== (version === 1 ? measured.maxBytes : null)) {
    findings.push(finding('CONTEXT_RECEIPT_BUDGET_MISMATCH', 'receipt.assembledContextBudgetBytes'));
  }
  if (receipt.assembledContextCheck !== 'PASSED') {
    findings.push(finding('CONTEXT_RECEIPT_NOT_PASSED', 'receipt.assembledContextCheck'));
  }
  const validDigest = typeof receipt.assembledContextSha256 === 'string' && SHA64.test(receipt.assembledContextSha256);
  if (version === 2 && !validDigest) {
    findings.push(finding('INVALID_CONTEXT_RECEIPT_DIGEST', 'receipt.assembledContextSha256'));
  }
  if (typeof receipt.assembledContext === 'string' && validDigest
    && sha256(receipt.assembledContext) !== receipt.assembledContextSha256) {
    findings.push(finding('CONTEXT_RECEIPT_HASH_MISMATCH', 'receipt.assembledContextSha256'));
  }
  if (version === 2) {
    if (receipt.assembledContextBudgetBytes !== null) {
      findings.push(finding('INVALID_V2_ASSEMBLED_CONTEXT_BUDGET', 'receipt.assembledContextBudgetBytes'));
    }
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
  if (manifest.contextPolicyVersion !== 2) {
    findings.push(finding('TRUSTED_CONTEXT_MANIFEST_VERSION_MISMATCH', 'trustedManifest.contextPolicyVersion'));
  }
  for (const field of ['policySha', 'baseSha', 'headSha']) {
    if (manifest[field] !== handoff[field]) findings.push(finding('TRUSTED_CONTEXT_MANIFEST_DRIFT', `trustedManifest.${field}`));
  }
  if (!sameRepository(manifest.repository, handoff.repository)) {
    findings.push(finding('TRUSTED_CONTEXT_MANIFEST_DRIFT', 'trustedManifest.repository'));
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

function evaluateRuntime(receipt, runtime, findings) {
  const measurement = isRecord(runtime) && Object.hasOwn(runtime, 'status')
    ? runtime
    : receipt?.runtime;
  const assessed = assessRuntime(measurement);
  findings.push(...assessed.findings);
  const capabilities = receipt?.compactionCapabilities ?? measurement?.compactionCapabilities;
  const compaction = chooseCompaction(capabilities, { required: receipt?.compactionRequired === true });
  if (compaction.blocked) findings.push(finding('UNSUPPORTED_COMPACTION', 'receipt.compactionCapabilities'));
  return { ...assessed, compaction };
}

export function evaluateContextAdmission({
  handoff,
  contextPolicy = DEFAULT_CONTEXT_POLICY,
  receipt,
  trustedManifest,
  sourceVerifier,
  runtime = null
} = {}) {
  const findings = [];
  if (!isRecord(handoff)) return { allowed: false, version: null, findings: [finding('INVALID_HANDOFF', 'handoff')] };

  const resolved = resolveContextPolicy(handoff, contextPolicy);
  findings.push(...resolved.findings);
  if (!resolved.admitted) return { allowed: false, version: resolved.version, findings };

  const version = resolved.version;
  validateReceiptShape(receipt, handoff, version, findings);
  if (version === 1 && receipt === undefined) {
    return { allowed: findings.length === 0, version, findings, runtime: { status: 'UNMEASURED' } };
  }
  if (!isRecord(receipt)) return { allowed: false, version, findings };

  validateAggregateReceipt(receipt, handoff, version, findings);
  if (version === 1) {
    // Runtime findings must be collected before deriving the decision.
    const runtimeAssessment = evaluateRuntime(receipt, runtime, findings);
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

  const runtimeAssessment = evaluateRuntime(receipt, runtime, findings);
  return { allowed: findings.length === 0, version, findings, runtime: runtimeAssessment };
}

export async function recoverContextAdmission({
  store,
  checkpointId,
  current,
  ...admission
} = {}) {
  if (!store || typeof store.loadLatest !== 'function') {
    return { allowed: false, findings: [finding('CHECKPOINT_STORE_REQUIRED', 'store')] };
  }
  const restored = await store.loadLatest(checkpointId, { current });
  if (!restored.valid) return { allowed: false, findings: restored.findings, checkpoint: restored.checkpoint };
  const result = evaluateContextAdmission(admission);
  return { ...result, checkpoint: restored.checkpoint };
}
