export const TASK_CONTRACT_VERSION = 2;
export const LEGACY_TASK_CONTRACT_VERSION = 1;
export const ASSEMBLED_CONTEXT_BUDGET_BYTES = 32768;

export const CANONICAL_EXECUTION_POLICY = Object.freeze({
  contractVersion: TASK_CONTRACT_VERSION,
  roles: Object.freeze(['planner', 'architect', 'executor', 'reviewer', 'auditor']),
  modelSelection: 'risk-capability',
  publisher: Object.freeze({
    kind: 'trusted',
    publicationBatchesPerRevision: 1,
    historyRewrite: 'forbidden'
  }),
  review: Object.freeze({
    reviewsPerHeadSha: 1,
    requiresGreenCi: true,
    findings: 'consolidated',
    reviewerMutations: 'forbidden'
  }),
  corrections: Object.freeze({
    authorization: 'upfront-or-legacy-human',
    maxBatches: 2
  }),
  merge: 'human-only'
});

const POLICY_KEYS = new Set(['contractVersion', 'roles', 'modelSelection', 'publisher', 'review', 'corrections', 'merge']);
const PUBLISHER_KEYS = new Set(['kind', 'publicationBatchesPerRevision', 'historyRewrite']);
const REVIEW_KEYS = new Set(['reviewsPerHeadSha', 'requiresGreenCi', 'findings', 'reviewerMutations']);
const CORRECTION_KEYS = new Set(['authorization', 'maxBatches']);
const HANDOFF_V2_KEYS = new Set([
  'contractVersion', 'taskId', 'repository', 'role', 'policySha', 'baseSha', 'headSha', 'approval',
  'assembledContextBudgetBytes', 'assembledContextActualBytes', 'assembledContextCheck'
]);
const APPROVAL_KEYS = new Set(['reference', 'allowedPaths', 'publication', 'maxCorrectionBatches']);
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

function finding(code, path, details = {}) {
  return { code, path, ...details };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isShaHistory(value) {
  return Array.isArray(value) && value.every((sha) => typeof sha === 'string' && SHA_PATTERN.test(sha));
}

function isConcretePathList(value, { nonEmpty = false } = {}) {
  return Array.isArray(value)
    && (!nonEmpty || value.length > 0)
    && value.every((entry) => isNonEmptyString(entry)
      && !entry.startsWith('/')
      && !entry.includes('\\')
      && !entry.includes('\0')
      && !entry.includes('*')
      && !entry.split('/').some((part) => part === '' || part === '.' || part === '..'))
    && new Set(value).size === value.length;
}

function samePathSet(left, right) {
  return left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function unknownKeys(value, allowed, prefix, findings) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value).sort()) {
    if (!allowed.has(key)) findings.push(finding('UNKNOWN_KEY', `${prefix}.${key}`));
  }
}

function validateExactArray(actual, expected, path, findings) {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    findings.push(finding('INVALID_EXECUTION_ROLES', path));
  }
}

export function validateExecutionPolicyConfig(value, path = 'manifest.executionPolicy') {
  const findings = [];
  if (!isObject(value)) return [finding('INVALID_EXECUTION_POLICY', path)];

  unknownKeys(value, POLICY_KEYS, path, findings);
  if (value.contractVersion !== TASK_CONTRACT_VERSION) findings.push(finding('INVALID_TASK_CONTRACT_VERSION', `${path}.contractVersion`));
  validateExactArray(value.roles, CANONICAL_EXECUTION_POLICY.roles, `${path}.roles`, findings);
  if (value.modelSelection !== 'risk-capability') findings.push(finding('INVALID_MODEL_SELECTION_POLICY', `${path}.modelSelection`));

  if (!isObject(value.publisher)) {
    findings.push(finding('INVALID_PUBLISHER_POLICY', `${path}.publisher`));
  } else {
    unknownKeys(value.publisher, PUBLISHER_KEYS, `${path}.publisher`, findings);
    if (value.publisher.kind !== 'trusted') findings.push(finding('INVALID_PUBLISHER_KIND', `${path}.publisher.kind`));
    if (value.publisher.publicationBatchesPerRevision !== 1) findings.push(finding('INVALID_PUBLICATION_BATCH_LIMIT', `${path}.publisher.publicationBatchesPerRevision`));
    if (value.publisher.historyRewrite !== 'forbidden') findings.push(finding('INVALID_HISTORY_REWRITE_POLICY', `${path}.publisher.historyRewrite`));
  }

  if (!isObject(value.review)) {
    findings.push(finding('INVALID_REVIEW_POLICY', `${path}.review`));
  } else {
    unknownKeys(value.review, REVIEW_KEYS, `${path}.review`, findings);
    if (value.review.reviewsPerHeadSha !== 1) findings.push(finding('INVALID_REVIEW_PER_SHA_LIMIT', `${path}.review.reviewsPerHeadSha`));
    if (value.review.requiresGreenCi !== true) findings.push(finding('INVALID_REVIEW_CI_POLICY', `${path}.review.requiresGreenCi`));
    if (value.review.findings !== 'consolidated') findings.push(finding('INVALID_FINDINGS_POLICY', `${path}.review.findings`));
    if (value.review.reviewerMutations !== 'forbidden') findings.push(finding('INVALID_REVIEWER_MUTATION_POLICY', `${path}.review.reviewerMutations`));
  }

  if (!isObject(value.corrections)) {
    findings.push(finding('INVALID_CORRECTION_POLICY', `${path}.corrections`));
  } else {
    unknownKeys(value.corrections, CORRECTION_KEYS, `${path}.corrections`, findings);
    if (value.corrections.authorization !== 'upfront-or-legacy-human') findings.push(finding('INVALID_CORRECTION_AUTHORIZATION_POLICY', `${path}.corrections.authorization`));
    if (value.corrections.maxBatches !== 2) findings.push(finding('INVALID_CORRECTION_BATCH_LIMIT', `${path}.corrections.maxBatches`));
  }

  if (value.merge !== 'human-only') findings.push(finding('INVALID_MERGE_POLICY', `${path}.merge`));
  return findings;
}

function validAllowedPath(value) {
  if (!isNonEmptyString(value) || value.startsWith('/') || value.includes('\\') || value.includes('\0')) return false;
  const base = value.endsWith('/**') ? value.slice(0, -3) : value;
  if (!base || base.split('/').some((part) => part === '' || part === '.' || part === '..')) return false;
  return /^[A-Za-z0-9._*\/-]+$/u.test(value) && !value.includes('***');
}

function pathAllowed(changedPath, allowedPaths) {
  return allowedPaths.some((allowed) => {
    if (allowed === '**') return true;
    if (allowed.endsWith('/**')) {
      const prefix = allowed.slice(0, -3);
      return changedPath === prefix || changedPath.startsWith(`${prefix}/`);
    }
    return changedPath === allowed;
  });
}

function validateAggregateContext(handoff, findings) {
  if (handoff.assembledContextBudgetBytes !== ASSEMBLED_CONTEXT_BUDGET_BYTES) {
    findings.push(finding('INVALID_ASSEMBLED_CONTEXT_BUDGET', 'handoff.assembledContextBudgetBytes'));
  }
  if (!Number.isInteger(handoff.assembledContextActualBytes) || handoff.assembledContextActualBytes <= 0) {
    findings.push(finding('INVALID_ASSEMBLED_CONTEXT_ACTUAL_BYTES', 'handoff.assembledContextActualBytes'));
  } else if (handoff.assembledContextActualBytes > ASSEMBLED_CONTEXT_BUDGET_BYTES) {
    findings.push(finding('ASSEMBLED_CONTEXT_BUDGET_EXCEEDED', 'handoff.assembledContextActualBytes', {
      actualBytes: handoff.assembledContextActualBytes,
      maxBytes: ASSEMBLED_CONTEXT_BUDGET_BYTES
    }));
  }
  if (handoff.assembledContextCheck !== 'PASSED') findings.push(finding('ASSEMBLED_CONTEXT_NOT_PASSED', 'handoff.assembledContextCheck'));
}

function legacyVersion(value) {
  return value.contractVersion === undefined || value.contractVersion === LEGACY_TASK_CONTRACT_VERSION;
}

export function normalizeTaskHandoff(value) {
  if (!isObject(value)) return { contractVersion: null, compatibility: 'invalid' };
  if (legacyVersion(value)) {
    return {
      ...value,
      contractVersion: LEGACY_TASK_CONTRACT_VERSION,
      compatibility: 'legacy-human-gated',
      automaticPublicationAllowed: false,
      automaticCorrectionBatches: 0
    };
  }
  return {
    ...value,
    compatibility: value.contractVersion === TASK_CONTRACT_VERSION ? 'current' : 'unsupported',
    automaticPublicationAllowed: value.approval?.publication === 'allowed',
    automaticCorrectionBatches: Number.isInteger(value.approval?.maxCorrectionBatches)
      ? value.approval.maxCorrectionBatches
      : 0
  };
}

export function validateTaskHandoff(value, policy = CANONICAL_EXECUTION_POLICY) {
  const findings = [...validateExecutionPolicyConfig(policy, 'policy')];
  if (!isObject(value)) return { valid: false, contractVersion: null, compatibility: 'invalid', findings: [...findings, finding('INVALID_HANDOFF', 'handoff')] };

  const normalized = normalizeTaskHandoff(value);
  if (![LEGACY_TASK_CONTRACT_VERSION, TASK_CONTRACT_VERSION].includes(normalized.contractVersion)) {
    findings.push(finding('UNSUPPORTED_HANDOFF_VERSION', 'handoff.contractVersion'));
    return { valid: false, ...normalized, findings };
  }
  if (findings.length > 0) return { valid: false, ...normalized, findings };

  if (!isNonEmptyString(value.policySha) || !SHA_PATTERN.test(value.policySha)) findings.push(finding('INVALID_POLICY_SHA', 'handoff.policySha'));
  if (!isNonEmptyString(value.baseSha) || !SHA_PATTERN.test(value.baseSha)) findings.push(finding('INVALID_BASE_SHA', 'handoff.baseSha'));
  if (normalized.contractVersion === TASK_CONTRACT_VERSION) {
    if (!isNonEmptyString(value.headSha) || !SHA_PATTERN.test(value.headSha)) findings.push(finding('INVALID_HEAD_SHA', 'handoff.headSha'));
  } else if (value.headSha !== undefined && (!isNonEmptyString(value.headSha) || !SHA_PATTERN.test(value.headSha))) {
    findings.push(finding('INVALID_HEAD_SHA', 'handoff.headSha'));
  }
  validateAggregateContext(value, findings);

  if (normalized.contractVersion === LEGACY_TASK_CONTRACT_VERSION) {
    if (!isNonEmptyString(value.approvalReference)) findings.push(finding('MISSING_APPROVAL', 'handoff.approvalReference'));
    return { valid: findings.length === 0, ...normalized, findings };
  }

  unknownKeys(value, HANDOFF_V2_KEYS, 'handoff', findings);
  if (!isNonEmptyString(value.taskId)) findings.push(finding('INVALID_TASK_ID', 'handoff.taskId'));
  if (!REPOSITORY_PATTERN.test(value.repository ?? '')) findings.push(finding('INVALID_HANDOFF_REPOSITORY', 'handoff.repository'));
  if (value.role !== 'executor') findings.push(finding('INVALID_HANDOFF_ROLE', 'handoff.role'));

  if (!isObject(value.approval)) {
    findings.push(finding('MISSING_APPROVAL', 'handoff.approval'));
  } else {
    unknownKeys(value.approval, APPROVAL_KEYS, 'handoff.approval', findings);
    if (!isNonEmptyString(value.approval.reference)) findings.push(finding('MISSING_APPROVAL', 'handoff.approval.reference'));
    if (!Array.isArray(value.approval.allowedPaths) || value.approval.allowedPaths.length === 0 || value.approval.allowedPaths.some((entry) => !validAllowedPath(entry))) {
      findings.push(finding('INVALID_ALLOWED_PATHS', 'handoff.approval.allowedPaths'));
    }
    if (!['allowed', 'forbidden'].includes(value.approval.publication)) findings.push(finding('INVALID_PUBLICATION_APPROVAL', 'handoff.approval.publication'));
    if (!Number.isInteger(value.approval.maxCorrectionBatches) || value.approval.maxCorrectionBatches < 0 || value.approval.maxCorrectionBatches > policy.corrections.maxBatches) {
      findings.push(finding('INVALID_CORRECTION_APPROVAL', 'handoff.approval.maxCorrectionBatches'));
    }
  }

  return { valid: findings.length === 0, ...normalized, findings };
}

function currentShaFindings(handoff, runtime, action) {
  const findings = [];
  if (handoff.contractVersion === TASK_CONTRACT_VERSION && runtime.currentRepository !== handoff.repository) findings.push(finding('REPOSITORY_MISMATCH', 'runtime.currentRepository'));
  if (runtime.currentPolicySha !== handoff.policySha) findings.push(finding('STALE_POLICY_SHA', 'runtime.currentPolicySha'));
  if (runtime.currentBaseSha !== handoff.baseSha) findings.push(finding('STALE_BASE_SHA', 'runtime.currentBaseSha'));
  if (handoff.headSha !== undefined && runtime.currentHeadSha !== handoff.headSha) findings.push(finding('STALE_HEAD_SHA', 'handoff.headSha'));
  else if (action.expectedHeadSha !== undefined && runtime.currentHeadSha !== action.expectedHeadSha) findings.push(finding('STALE_HEAD_SHA', 'action.expectedHeadSha'));
  return findings;
}

function scopeFindings(handoff, runtime, action) {
  const requiresExplicitChangedPaths = ['execute', 'correct', 'publish'].includes(action.kind);
  if (!isConcretePathList(action.changedPaths, { nonEmpty: requiresExplicitChangedPaths })) {
    return requiresExplicitChangedPaths ? [finding('INVALID_CHANGED_PATHS', 'action.changedPaths')] : [];
  }

  let changedPaths = action.changedPaths;
  if (requiresExplicitChangedPaths) {
    const evidence = runtime.diffEvidence;
    if (!isObject(evidence) || !isConcretePathList(evidence.changedPaths, { nonEmpty: true })) {
      return [finding('DIFF_EVIDENCE_UNAVAILABLE', 'runtime.diffEvidence')];
    }
    if (evidence.baseSha !== runtime.currentBaseSha || evidence.headSha !== runtime.currentHeadSha) {
      return [finding('STALE_DIFF_EVIDENCE', 'runtime.diffEvidence')];
    }
    if (!samePathSet(action.changedPaths, evidence.changedPaths)) {
      return [finding('CHANGED_PATHS_MISMATCH', 'action.changedPaths')];
    }
    changedPaths = evidence.changedPaths;
  }

  const allowedPaths = handoff.contractVersion === TASK_CONTRACT_VERSION
    ? handoff.approval.allowedPaths
    : runtime.legacyAllowedPaths;
  if (!Array.isArray(allowedPaths) || allowedPaths.length === 0) {
    return changedPaths.length > 0 ? [finding('LEGACY_SCOPE_REQUIRES_HUMAN', 'runtime.legacyAllowedPaths')] : [];
  }
  return changedPaths.filter((changedPath) => !pathAllowed(changedPath, allowedPaths))
    .map((changedPath) => finding('SCOPE_EXPANSION', changedPath));
}

export function evaluateTaskAction({ handoff: inputHandoff, policy = CANONICAL_EXECUTION_POLICY, runtime = {}, action = {} }) {
  const validation = validateTaskHandoff(inputHandoff, policy);
  if (!validation.valid) return { allowed: false, findings: validation.findings, compatibility: validation.compatibility };
  const handoff = validation;
  const findings = [
    ...currentShaFindings(handoff, runtime, action),
    ...scopeFindings(handoff, runtime, action)
  ];

  if (action.kind === 'publish') {
    if (handoff.contractVersion === LEGACY_TASK_CONTRACT_VERSION) {
      findings.push(finding('LEGACY_PUBLICATION_REQUIRES_HUMAN', 'action.kind'));
    } else if (handoff.approval.publication !== 'allowed') {
      findings.push(finding('PUBLICATION_NOT_AUTHORIZED', 'handoff.approval.publication'));
    }
    if (runtime.executionStatus !== 'IMPLEMENTATION_COMPLETE') findings.push(finding('IMPLEMENTATION_NOT_COMPLETE', 'runtime.executionStatus'));
    if (runtime.localValidation?.status !== 'passed' || runtime.localValidation?.headSha !== runtime.currentHeadSha) {
      findings.push(finding('LOCAL_VALIDATION_NOT_PASSED_FOR_HEAD', 'runtime.localValidation'));
    }
    if (action.actorRole !== 'publisher') findings.push(finding('UNTRUSTED_PUBLISHER', 'action.actorRole'));
    if (!Number.isInteger(runtime.publicationBatchesForRevision) || runtime.publicationBatchesForRevision < 0) {
      findings.push(finding('PUBLICATION_HISTORY_UNAVAILABLE', 'runtime.publicationBatchesForRevision'));
    } else if (runtime.publicationBatchesForRevision >= policy.publisher.publicationBatchesPerRevision) {
      findings.push(finding('DUPLICATE_PUBLICATION_BATCH', 'runtime.publicationBatchesForRevision'));
    }
    if (action.commitCount !== 1 || action.pushCount !== 1) findings.push(finding('ONE_BATCH_PUBLICATION_REQUIRED', 'action'));
    if (action.forcePush !== false || action.historyRewrite !== false) findings.push(finding('PUBLISHED_HISTORY_REWRITE_FORBIDDEN', 'action'));
  } else if (action.kind === 'review') {
    if (action.actorRole !== 'reviewer') findings.push(finding('INVALID_REVIEWER_ROLE', 'action.actorRole'));
    if (policy.review.requiresGreenCi && (runtime.ci?.headSha !== runtime.currentHeadSha || runtime.ci?.status !== 'green')) {
      findings.push(finding('CI_NOT_GREEN_FOR_HEAD', 'runtime.ci'));
    }
    if (!isShaHistory(runtime.reviewedHeadShas) || !isShaHistory(runtime.reviewInProgressHeadShas)) {
      findings.push(finding('REVIEW_HISTORY_UNAVAILABLE', 'runtime.reviewedHeadShas'));
    } else if (runtime.reviewedHeadShas.includes(runtime.currentHeadSha) || runtime.reviewInProgressHeadShas.includes(runtime.currentHeadSha)) {
      findings.push(finding('DUPLICATE_REVIEW', 'runtime.reviewedHeadShas'));
    }
    if (!isNonEmptyString(runtime.executorContextId) || !isNonEmptyString(runtime.reviewerContextId)) findings.push(finding('REVIEW_INDEPENDENCE_UNPROVEN', 'runtime.reviewerContextId'));
    else if (runtime.executorContextId === runtime.reviewerContextId) findings.push(finding('REVIEW_NOT_INDEPENDENT', 'runtime.reviewerContextId'));
    if (action.mutationRequested === true) findings.push(finding('REVIEWER_MUTATION_FORBIDDEN', 'action.mutationRequested'));
  } else if (action.kind === 'correct') {
    if (action.actorRole !== 'executor') findings.push(finding('INVALID_CORRECTION_ROLE', 'action.actorRole'));
    if (handoff.contractVersion === LEGACY_TASK_CONTRACT_VERSION) {
      findings.push(finding('LEGACY_CORRECTION_REQUIRES_HUMAN', 'action.kind'));
    } else {
      const used = runtime.correctionBatchesUsed;
      const approved = handoff.approval.maxCorrectionBatches;
      if (!Number.isInteger(used) || used < 0) findings.push(finding('CORRECTION_HISTORY_UNAVAILABLE', 'runtime.correctionBatchesUsed'));
      else if (used >= policy.corrections.maxBatches) findings.push(finding('CORRECTION_LIMIT_EXCEEDED', 'runtime.correctionBatchesUsed'));
      else if (used >= approved) findings.push(finding('CORRECTION_NOT_AUTHORIZED', 'handoff.approval.maxCorrectionBatches'));
    }
    if (action.findingsPackageCount !== 1) findings.push(finding('FINDINGS_NOT_CONSOLIDATED', 'action.findingsPackageCount'));
    if (!isShaHistory(runtime.reviewedHeadShas)) findings.push(finding('REVIEW_HISTORY_UNAVAILABLE', 'runtime.reviewedHeadShas'));
    else if (!runtime.reviewedHeadShas.includes(runtime.currentHeadSha)) findings.push(finding('CURRENT_HEAD_NOT_REVIEWED', 'runtime.reviewedHeadShas'));
    if (action.findingsHeadSha !== runtime.currentHeadSha) findings.push(finding('STALE_FINDINGS_PACKAGE', 'action.findingsHeadSha'));
  } else if (action.kind === 'execute') {
    if (action.actorRole !== 'executor') findings.push(finding('INVALID_EXECUTOR_ROLE', 'action.actorRole'));
  } else if (action.kind === 'audit') {
    if (action.actorRole !== 'auditor') findings.push(finding('INVALID_AUDITOR_ROLE', 'action.actorRole'));
    if (action.mutationRequested === true) findings.push(finding('AUDITOR_MUTATION_FORBIDDEN', 'action.mutationRequested'));
  } else if (action.kind === 'merge') {
    findings.push(finding('HUMAN_MERGE_REQUIRED', 'action.kind'));
  } else {
    findings.push(finding('INVALID_TASK_ACTION', 'action.kind'));
  }

  return { allowed: findings.length === 0, findings, compatibility: validation.compatibility };
}
