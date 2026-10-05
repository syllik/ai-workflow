import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ASSEMBLED_CONTEXT_BUDGET_BYTES,
  CANONICAL_EXECUTION_POLICY,
  evaluateTaskAction,
  normalizeTaskHandoff,
  validateExecutionPolicyConfig,
  validateTaskHandoff
} from '../scripts/workspace/task-policy.mjs';

const policySha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const headSha = 'c'.repeat(40);
const publishedHeadSha = 'e'.repeat(40);
const diffDigest = 'd'.repeat(64);
const taskBranch = 'policy/issue-47-vendor-neutral-role-contract';
const integrationBranch = 'master';
const requiredCiChecks = ['verify'];

function handoff(overrides = {}) {
  return {
    contractVersion: 2,
    taskId: 'policy-contract',
    repository: 'syllik/ai-workflow',
    taskBranch,
    integrationBranch,
    requiredCiChecks,
    role: 'executor',
    policySha,
    baseSha,
    headSha,
    approval: {
      reference: 'user-message:2026-10-04',
      allowedPaths: ['FLOW.md', 'global/**', 'scripts/workspace/**', 'test/**'],
      publication: 'allowed',
      maxCorrectionBatches: 2
    },
    assembledContextBudgetBytes: ASSEMBLED_CONTEXT_BUDGET_BYTES,
    assembledContextActualBytes: 12000,
    assembledContextCheck: 'PASSED',
    ...overrides
  };
}

function runtime(overrides = {}) {
  return {
    currentRepository: 'syllik/ai-workflow',
    currentPolicySha: policySha,
    currentBaseSha: baseSha,
    currentHeadSha: headSha,
    currentBranch: taskBranch,
    publishedRevision: {
      source: 'trusted-publisher',
      repository: 'syllik/ai-workflow',
      taskBranch,
      policySha,
      baseSha,
      headSha
    },
    workspaceRecord: {
      repository: 'syllik/ai-workflow',
      access: 'managed',
      status: 'active',
      integrationBranch
    },
    requiredCiReceipt: {
      source: 'repository-config',
      repository: 'syllik/ai-workflow',
      integrationBranch,
      checks: requiredCiChecks
    },
    publicationBatchesForRevision: 0,
    executionStatus: 'IMPLEMENTATION_COMPLETE',
    executionDiffDigest: diffDigest,
    localValidation: { headSha, status: 'passed', diffDigest },
    correctionBatchesUsed: 0,
    reviewedHeadShas: [],
    reviewInProgressHeadShas: [],
    executorContextId: 'executor-1',
    reviewerContextId: 'reviewer-1',
    ci: { headSha, status: 'green', checks: [{ name: 'verify', status: 'green' }] },
    reviewInitiation: { kind: 'explicit-after-green-ci', headSha, receiptId: 'user-comment:1' },
    diffEvidence: { baseSha, headSha, changedPaths: ['FLOW.md'], digest: diffDigest },
    ...overrides
  };
}

describe('execution policy config', () => {
  test('accepts only the canonical vendor-neutral contract', () => {
    assert.deepEqual(validateExecutionPolicyConfig(CANONICAL_EXECUTION_POLICY), []);
    assert.equal(CANONICAL_EXECUTION_POLICY.roles.includes('executor'), true);
    assert.equal(CANONICAL_EXECUTION_POLICY.roles.includes('reviewer'), true);
    assert.equal(JSON.stringify(CANONICAL_EXECUTION_POLICY).match(/\b(?:Sol|Luna|Codex)\b/iu), null);
  });

  test('rejects relaxed review/correction/publication limits', () => {
    const invalid = structuredClone(CANONICAL_EXECUTION_POLICY);
    invalid.publisher.publicationBatchesPerRevision = 2;
    invalid.review.reviewsPerHeadSha = 2;
    invalid.corrections.maxBatches = 3;
    const codes = validateExecutionPolicyConfig(invalid).map(({ code }) => code);
    assert.equal(codes.includes('INVALID_PUBLICATION_BATCH_LIMIT'), true);
    assert.equal(codes.includes('INVALID_REVIEW_PER_SHA_LIMIT'), true);
    assert.equal(codes.includes('INVALID_CORRECTION_BATCH_LIMIT'), true);
  });
});

describe('task handoff compatibility', () => {
  test('accepts v2 handoff with explicit upfront authority', () => {
    const result = validateTaskHandoff(handoff());
    assert.equal(result.valid, true);
    assert.equal(result.compatibility, 'current');
    assert.equal(result.automaticCorrectionBatches, 2);
  });

  test('keeps a valid legacy handoff human-gated for publication and corrections', () => {
    const legacy = {
      approvalReference: 'human-approved-existing-task',
      policySha,
      baseSha,
      assembledContextBudgetBytes: 32768,
      assembledContextActualBytes: 4096,
      assembledContextCheck: 'PASSED'
    };
    const normalized = normalizeTaskHandoff(legacy);
    const validation = validateTaskHandoff(legacy);
    assert.equal(validation.valid, true);
    assert.equal(normalized.compatibility, 'legacy-human-gated');
    assert.equal(normalized.automaticPublicationAllowed, false);
    assert.equal(normalized.automaticCorrectionBatches, 0);
    assert.equal(evaluateTaskAction({ handoff: legacy, runtime: runtime({ legacyAllowedPaths: ['FLOW.md'] }), action: { kind: 'correct', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], findingsPackageCount: 1 } }).allowed, false);
  });

  test('retains the exact 32768-byte normal handoff gate', () => {
    assert.equal(validateTaskHandoff(handoff({ assembledContextActualBytes: 32768 })).valid, true);
    const over = validateTaskHandoff(handoff({ assembledContextActualBytes: 32769 }));
    assert.equal(over.valid, false);
    assert.equal(over.findings.some(({ code }) => code === 'ASSEMBLED_CONTEXT_BUDGET_EXCEEDED'), true);
  });
});

describe('deterministic task actions', () => {
  test('rejects scope expansion', () => {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ diffEvidence: { baseSha, headSha, changedPaths: ['deployment/production.yml'] } }),
      action: { kind: 'execute', expectedHeadSha: headSha, changedPaths: ['deployment/production.yml'] }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'SCOPE_EXPANSION'), true);
  });

  test('rejects missing approval', () => {
    const invalid = handoff();
    delete invalid.approval;
    const result = evaluateTaskAction({ handoff: invalid, runtime: runtime(), action: { kind: 'execute', expectedHeadSha: headSha } });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'MISSING_APPROVAL'), true);
  });

  test('rejects stale policy, base, and head SHAs', () => {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ currentPolicySha: 'd'.repeat(40), currentBaseSha: 'e'.repeat(40), currentHeadSha: 'f'.repeat(40) }),
      action: { kind: 'execute', expectedHeadSha: headSha }
    });
    const codes = result.findings.map(({ code }) => code);
    assert.equal(codes.includes('STALE_POLICY_SHA'), true);
    assert.equal(codes.includes('STALE_BASE_SHA'), true);
    assert.equal(codes.includes('STALE_HEAD_SHA'), true);
  });

  test('rejects duplicate review for the same SHA', () => {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ reviewedHeadShas: [headSha] }),
      action: { kind: 'review', actorRole: 'reviewer', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], mutationRequested: false }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'DUPLICATE_REVIEW'), true);
  });

  test('rejects a review already running for the same SHA', () => {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ reviewInProgressHeadShas: [headSha] }),
      action: { kind: 'review', actorRole: 'reviewer', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], mutationRequested: false }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'DUPLICATE_REVIEW'), true);
  });

  test('requires green CI on the exact head and forbids reviewer mutations', () => {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ ci: { headSha: 'd'.repeat(40), status: 'green' } }),
      action: { kind: 'review', actorRole: 'reviewer', expectedHeadSha: headSha, changedPaths: [], mutationRequested: true }
    });
    const codes = result.findings.map(({ code }) => code);
    assert.equal(codes.includes('CI_NOT_GREEN_FOR_HEAD'), true);
    assert.equal(codes.includes('REVIEWER_MUTATION_FORBIDDEN'), true);
  });

  test('rejects a third correction batch even when approval asks for more', () => {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ correctionBatchesUsed: 2 }),
      action: { kind: 'correct', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], findingsPackageCount: 1 }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'CORRECTION_LIMIT_EXCEEDED'), true);
  });

  test('rejects a correction not covered by upfront approval', () => {
    const limited = handoff({ approval: { ...handoff().approval, maxCorrectionBatches: 0 } });
    const result = evaluateTaskAction({
      handoff: limited,
      runtime: runtime(),
      action: { kind: 'correct', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], findingsPackageCount: 1 }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'CORRECTION_NOT_AUTHORIZED'), true);
  });

  test('requires exactly one consolidated findings package for corrections', () => {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime(),
      action: { kind: 'correct', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], findingsPackageCount: 2 }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'FINDINGS_NOT_CONSOLIDATED'), true);
  });

  test('enforces one trusted publication batch without history rewrite', () => {
    const valid = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime(),
      action: { kind: 'publish', actorRole: 'publisher', destinationBranch: taskBranch, pullRequestBaseBranch: integrationBranch, expectedHeadSha: headSha, changedPaths: ['FLOW.md'], commitCount: 1, pushCount: 1, forcePush: false, historyRewrite: false }
    });
    assert.equal(valid.allowed, true);

    const invalid = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ publicationBatchesForRevision: 1 }),
      action: { kind: 'publish', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], commitCount: 2, pushCount: 1, forcePush: true }
    });
    const codes = invalid.findings.map(({ code }) => code);
    assert.equal(codes.includes('UNTRUSTED_PUBLISHER'), true);
    assert.equal(codes.includes('DUPLICATE_PUBLICATION_BATCH'), true);
    assert.equal(codes.includes('ONE_BATCH_PUBLICATION_REQUIRED'), true);
    assert.equal(codes.includes('PUBLISHED_HISTORY_REWRITE_FORBIDDEN'), true);
  });

  test('never authorizes merge', () => {
    const result = evaluateTaskAction({ handoff: handoff(), runtime: runtime(), action: { kind: 'merge', expectedHeadSha: headSha, changedPaths: [] } });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'HUMAN_MERGE_REQUIRED'), true);
  });
});

test('rejects mutating actions without explicit changed paths', () => {
  for (const kind of ['execute', 'correct', 'publish']) {
    const action = { kind, actorRole: kind === 'publish' ? 'publisher' : 'executor', expectedHeadSha: headSha };
    if (kind === 'correct') {
      action.findingsPackageCount = 1;
      action.findingsHeadSha = headSha;
    }
    if (kind === 'publish') {
      action.commitCount = 1;
      action.pushCount = 1;
      action.forcePush = false;
      action.historyRewrite = false;
    }
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ reviewedHeadShas: kind === 'correct' ? [headSha] : [] }),
      action
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'INVALID_CHANGED_PATHS'), true);
  }
});

test('binds the handoff to the runtime repository identity', () => {
  const result = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime({ currentRepository: 'syllik/mirror' }),
    action: { kind: 'execute', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'] }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.findings.some(({ code }) => code === 'REPOSITORY_MISMATCH'), true);
});

test('requires completed implementation and local validation for publication', () => {
  const result = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime({ executionStatus: 'IN_PROGRESS', localValidation: { headSha, status: 'failed', diffDigest } }),
    action: { kind: 'publish', actorRole: 'publisher', destinationBranch: taskBranch, pullRequestBaseBranch: integrationBranch, expectedHeadSha: headSha, changedPaths: ['FLOW.md'], commitCount: 1, pushCount: 1, forcePush: false, historyRewrite: false }
  });
  assert.equal(result.allowed, false);
  const codes = result.findings.map(({ code }) => code);
  assert.equal(codes.includes('IMPLEMENTATION_NOT_COMPLETE'), true);
  assert.equal(codes.includes('LOCAL_VALIDATION_NOT_PASSED_FOR_HEAD'), true);
});

test('enforces executor and auditor actor roles', () => {
  const execute = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime(),
    action: { kind: 'execute', actorRole: 'reviewer', expectedHeadSha: headSha, changedPaths: ['FLOW.md'] }
  });
  assert.equal(execute.findings.some(({ code }) => code === 'INVALID_EXECUTOR_ROLE'), true);

  const audit = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime(),
    action: { kind: 'audit', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: [] }
  });
  assert.equal(audit.findings.some(({ code }) => code === 'INVALID_AUDITOR_ROLE'), true);
});

test('binds correction findings to an independent review of the current head', () => {
  const noReview = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime(),
    action: { kind: 'correct', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], findingsPackageCount: 1, findingsHeadSha: headSha }
  });
  assert.equal(noReview.findings.some(({ code }) => code === 'CURRENT_HEAD_NOT_REVIEWED'), true);

  const stalePackage = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime({ reviewedHeadShas: [headSha] }),
    action: { kind: 'correct', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], findingsPackageCount: 1, findingsHeadSha: 'd'.repeat(40) }
  });
  assert.equal(stalePackage.findings.some(({ code }) => code === 'STALE_FINDINGS_PACKAGE'), true);

  const valid = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime({ reviewedHeadShas: [headSha] }),
    action: { kind: 'correct', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], findingsPackageCount: 1, findingsHeadSha: headSha }
  });
  assert.equal(valid.allowed, true);
});

test('keeps legacy execution compatible without a repository field', () => {
  const legacy = {
    approvalReference: 'human-approved-existing-task',
    policySha,
    baseSha,
    assembledContextBudgetBytes: 32768,
    assembledContextActualBytes: 4096,
    assembledContextCheck: 'PASSED'
  };
  const result = evaluateTaskAction({
    handoff: legacy,
    runtime: runtime({ legacyAllowedPaths: ['FLOW.md'] }),
    action: { kind: 'execute', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'] }
  });
  assert.equal(result.allowed, true);
});

test('requires headSha for v2 but keeps it optional for legacy compatibility', () => {
  const v2 = handoff();
  delete v2.headSha;
  const v2Result = validateTaskHandoff(v2);
  assert.equal(v2Result.valid, false);
  assert.equal(v2Result.findings.some(({ code }) => code === 'INVALID_HEAD_SHA'), true);

  const legacy = {
    approvalReference: 'human-approved-existing-task',
    policySha,
    baseSha,
    assembledContextBudgetBytes: 32768,
    assembledContextActualBytes: 4096,
    assembledContextCheck: 'PASSED'
  };
  assert.equal(validateTaskHandoff(legacy).valid, true);
});

test('rejects empty changed-path evidence for mutating actions', () => {
  for (const kind of ['execute', 'correct', 'publish']) {
    const action = { kind, actorRole: kind === 'publish' ? 'publisher' : 'executor', expectedHeadSha: headSha, changedPaths: [] };
    if (kind === 'correct') {
      action.findingsPackageCount = 1;
      action.findingsHeadSha = headSha;
    }
    if (kind === 'publish') {
      action.commitCount = 1;
      action.pushCount = 1;
      action.forcePush = false;
      action.historyRewrite = false;
    }
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ reviewedHeadShas: kind === 'correct' ? [headSha] : [] }),
      action
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'INVALID_CHANGED_PATHS'), true);
  }
});

test('requires explicit read-only intent for Auditor actions', () => {
  const valid = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime(),
    action: { kind: 'audit', actorRole: 'auditor', expectedHeadSha: headSha, changedPaths: [], mutationRequested: false }
  });
  assert.equal(valid.allowed, true);

  for (const mutationRequested of [undefined, null, true, 'true', 0]) {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime(),
      action: { kind: 'audit', actorRole: 'auditor', expectedHeadSha: headSha, changedPaths: [], mutationRequested }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'AUDITOR_MUTATION_FORBIDDEN'), true);
  }
});

test('denies legacy publication without dereferencing v2 approval', () => {
  const legacy = {
    approvalReference: 'human-approved-existing-task',
    policySha,
    baseSha,
    assembledContextBudgetBytes: 32768,
    assembledContextActualBytes: 4096,
    assembledContextCheck: 'PASSED'
  };
  const result = evaluateTaskAction({
    handoff: legacy,
    runtime: runtime({ legacyAllowedPaths: ['FLOW.md'] }),
    action: { kind: 'publish', actorRole: 'publisher', destinationBranch: taskBranch, pullRequestBaseBranch: integrationBranch, expectedHeadSha: headSha, changedPaths: ['FLOW.md'], commitCount: 1, pushCount: 1, forcePush: false, historyRewrite: false }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.findings.some(({ code }) => code === 'LEGACY_PUBLICATION_REQUIRES_HUMAN'), true);
});

test('requires an explicit publication-batch receipt', () => {
  for (const value of [undefined, -1, 0.5, '0']) {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ publicationBatchesForRevision: value }),
      action: { kind: 'publish', actorRole: 'publisher', destinationBranch: taskBranch, pullRequestBaseBranch: integrationBranch, expectedHeadSha: headSha, changedPaths: ['FLOW.md'], commitCount: 1, pushCount: 1, forcePush: false, historyRewrite: false }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'PUBLICATION_HISTORY_UNAVAILABLE'), true);
  }
});

test('requires an explicit correction-batch receipt', () => {
  for (const value of [undefined, -1, 0.5, '0']) {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ correctionBatchesUsed: value, reviewedHeadShas: [headSha] }),
      action: { kind: 'correct', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], findingsPackageCount: 1, findingsHeadSha: headSha }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'CORRECTION_HISTORY_UNAVAILABLE'), true);
  }
});

test('requires valid review-history receipts before starting review', () => {
  for (const overrides of [
    { reviewedHeadShas: undefined },
    { reviewInProgressHeadShas: undefined },
    { reviewedHeadShas: ['not-a-sha'] },
    { reviewInProgressHeadShas: ['not-a-sha'] }
  ]) {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime(overrides),
      action: { kind: 'review', actorRole: 'reviewer', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], mutationRequested: false }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'REVIEW_HISTORY_UNAVAILABLE'), true);
  }
});

test('binds mutating changed paths to pinned authoritative diff evidence', () => {
  const missing = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime({ diffEvidence: undefined }),
    action: { kind: 'execute', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'] }
  });
  assert.equal(missing.allowed, false);
  assert.equal(missing.findings.some(({ code }) => code === 'DIFF_EVIDENCE_UNAVAILABLE'), true);

  const stale = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime({ diffEvidence: { baseSha: 'd'.repeat(40), headSha, changedPaths: ['FLOW.md'] } }),
    action: { kind: 'execute', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'] }
  });
  assert.equal(stale.allowed, false);
  assert.equal(stale.findings.some(({ code }) => code === 'STALE_DIFF_EVIDENCE'), true);

  const partial = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime({ diffEvidence: { baseSha, headSha, changedPaths: ['FLOW.md', 'deployment/production.yml'] } }),
    action: { kind: 'execute', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'] }
  });
  assert.equal(partial.allowed, false);
  assert.equal(partial.findings.some(({ code }) => code === 'CHANGED_PATHS_MISMATCH'), true);

  const complete = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime({ diffEvidence: { baseSha, headSha, changedPaths: ['FLOW.md', 'deployment/production.yml'] } }),
    action: { kind: 'execute', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['deployment/production.yml', 'FLOW.md'] }
  });
  assert.equal(complete.allowed, false);
  assert.equal(complete.findings.some(({ code }) => code === 'SCOPE_EXPANSION'), true);
});

test('requires valid review history before authorizing a correction', () => {
  for (const reviewedHeadShas of [undefined, headSha, ['not-a-sha']]) {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ reviewedHeadShas }),
      action: { kind: 'correct', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], findingsPackageCount: 1, findingsHeadSha: headSha }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'REVIEW_HISTORY_UNAVAILABLE'), true);
  }
});

test('requires explicit false no-rewrite publication flags', () => {
  for (const flags of [
    {},
    { forcePush: false },
    { historyRewrite: false },
    { forcePush: 'false', historyRewrite: false },
    { forcePush: false, historyRewrite: 'false' }
  ]) {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime(),
      action: { kind: 'publish', actorRole: 'publisher', destinationBranch: taskBranch, pullRequestBaseBranch: integrationBranch, expectedHeadSha: headSha, changedPaths: ['FLOW.md'], commitCount: 1, pushCount: 1, ...flags }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'PUBLISHED_HISTORY_REWRITE_FORBIDDEN'), true);
  }
});

test('returns policy findings instead of throwing for malformed nested policy', () => {
  const invalid = structuredClone(CANONICAL_EXECUTION_POLICY);
  delete invalid.corrections;
  const result = validateTaskHandoff(handoff(), invalid);
  assert.equal(result.valid, false);
  assert.equal(result.findings.some(({ code }) => code === 'INVALID_CORRECTION_POLICY'), true);
});

test('does not let handoff input override computed validation result fields', () => {
  const legacy = {
    valid: true,
    findings: [],
    approvalReference: '',
    policySha,
    baseSha,
    assembledContextBudgetBytes: 32768,
    assembledContextActualBytes: 4096,
    assembledContextCheck: 'PASSED'
  };
  const legacyResult = validateTaskHandoff(legacy);
  assert.equal(legacyResult.valid, false);
  assert.equal(legacyResult.findings.some(({ code }) => code === 'MISSING_APPROVAL'), true);

  const v2 = handoff({ valid: true, findings: [] });
  delete v2.approval;
  const v2Result = validateTaskHandoff(v2);
  assert.equal(v2Result.valid, false);
  assert.equal(v2Result.findings.some(({ code }) => code === 'MISSING_APPROVAL'), true);

  const actionResult = evaluateTaskAction({
    handoff: legacy,
    runtime: runtime({ legacyAllowedPaths: ['FLOW.md'] }),
    action: { kind: 'execute', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'] }
  });
  assert.equal(actionResult.allowed, false);
});

test('fails closed for null runtime and action inputs', () => {
  const nullRuntime = evaluateTaskAction({
    handoff: handoff(),
    runtime: null,
    action: { kind: 'execute', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'] }
  });
  assert.equal(nullRuntime.allowed, false);
  assert.equal(nullRuntime.findings.some(({ code }) => code === 'INVALID_RUNTIME'), true);

  const nullAction = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime(),
    action: null
  });
  assert.equal(nullAction.allowed, false);
  assert.equal(nullAction.findings.some(({ code }) => code === 'INVALID_ACTION_INPUT'), true);
});

test('compares GitHub repository identities case-insensitively', () => {
  const result = evaluateTaskAction({
    handoff: handoff({ repository: 'Syllik/ai-workflow' }),
    runtime: runtime({ currentRepository: 'syllik/AI-WORKFLOW' }),
    action: { kind: 'execute', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'] }
  });
  assert.equal(result.allowed, true);
});

test('fails closed for a null policy-evaluation envelope', () => {
  const result = evaluateTaskAction(null);
  assert.equal(result.allowed, false);
  assert.equal(result.compatibility, 'invalid');
  assert.equal(result.findings.some(({ code }) => code === 'INVALID_POLICY_EVALUATION_INPUT'), true);
});

test('requires a concrete pinned head before legacy review', () => {
  const legacy = {
    approvalReference: 'human-approved-existing-task',
    policySha,
    baseSha,
    assembledContextBudgetBytes: 32768,
    assembledContextActualBytes: 4096,
    assembledContextCheck: 'PASSED'
  };
  const result = evaluateTaskAction({
    handoff: legacy,
    runtime: runtime({
      currentHeadSha: undefined,
      ci: { headSha: undefined, status: 'green', checks: [{ name: 'verify', status: 'green' }] },
      legacyAllowedPaths: ['FLOW.md']
    }),
    action: { kind: 'review', actorRole: 'reviewer', changedPaths: [], mutationRequested: false }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.findings.some(({ code }) => code === 'ACTION_HEAD_NOT_PINNED'), true);
});

test('requires explicit read-only intent for reviews', () => {
  for (const mutationRequested of [undefined, null, true, 'true', 0]) {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime(),
      action: { kind: 'review', actorRole: 'reviewer', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], mutationRequested }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'REVIEWER_MUTATION_FORBIDDEN'), true);
  }
});

test('binds publication receipts to the exact authoritative worktree diff', () => {
  const changedDigest = 'e'.repeat(64);

  const staleValidation = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime({
      diffEvidence: { baseSha, headSha, changedPaths: ['FLOW.md'], digest: changedDigest }
    }),
    action: { kind: 'publish', actorRole: 'publisher', destinationBranch: taskBranch, pullRequestBaseBranch: integrationBranch, expectedHeadSha: headSha, changedPaths: ['FLOW.md'], commitCount: 1, pushCount: 1, forcePush: false, historyRewrite: false }
  });
  assert.equal(staleValidation.allowed, false);
  assert.equal(staleValidation.findings.some(({ code }) => code === 'IMPLEMENTATION_NOT_COMPLETE'), true);
  assert.equal(staleValidation.findings.some(({ code }) => code === 'LOCAL_VALIDATION_NOT_PASSED_FOR_HEAD'), true);

  const refreshed = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime({
      executionDiffDigest: changedDigest,
      localValidation: { headSha, status: 'passed', diffDigest: changedDigest },
      diffEvidence: { baseSha, headSha, changedPaths: ['FLOW.md'], digest: changedDigest }
    }),
    action: { kind: 'publish', actorRole: 'publisher', destinationBranch: taskBranch, pullRequestBaseBranch: integrationBranch, expectedHeadSha: headSha, changedPaths: ['FLOW.md'], commitCount: 1, pushCount: 1, forcePush: false, historyRewrite: false }
  });
  assert.equal(refreshed.allowed, true);
});

test('rejects allowed-path wildcard forms the matcher does not support', () => {
  for (const invalidPath of ['src/*.js', 'src/**/file.js', 'src/foo*', 'src/***']) {
    const approval = { ...handoff().approval, allowedPaths: [invalidPath] };
    const result = validateTaskHandoff(handoff({ approval }));
    assert.equal(result.valid, false);
    assert.equal(result.findings.some(({ code }) => code === 'INVALID_ALLOWED_PATHS'), true);
  }

  for (const allowedPath of ['FLOW.md', 'src/**', '**']) {
    const approval = { ...handoff().approval, allowedPaths: [allowedPath] };
    assert.equal(validateTaskHandoff(handoff({ approval })).valid, true);
  }
});

test('binds publication to the authorized task and integration refs', () => {
  for (const actionOverrides of [
    { destinationBranch: integrationBranch },
    { destinationBranch: taskBranch, pullRequestBaseBranch: 'develop' }
  ]) {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime(),
      action: {
        kind: 'publish',
        actorRole: 'publisher',
        expectedHeadSha: headSha,
        changedPaths: ['FLOW.md'],
        destinationBranch: taskBranch,
        pullRequestBaseBranch: integrationBranch,
        commitCount: 1,
        pushCount: 1,
        forcePush: false,
        historyRewrite: false,
        ...actionOverrides
      }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'PUBLICATION_REF_MISMATCH'), true);
  }

  const wrongCheckout = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime({ currentBranch: integrationBranch }),
    action: {
      kind: 'publish',
      actorRole: 'publisher',
      expectedHeadSha: headSha,
      changedPaths: ['FLOW.md'],
      destinationBranch: taskBranch,
      pullRequestBaseBranch: integrationBranch,
      commitCount: 1,
      pushCount: 1,
      forcePush: false,
      historyRewrite: false
    }
  });
  assert.equal(wrongCheckout.allowed, false);
  assert.equal(wrongCheckout.findings.some(({ code }) => code === 'PUBLICATION_REF_MISMATCH'), true);
});

test('requires explicit post-CI review initiation evidence', () => {
  for (const reviewInitiation of [
    undefined,
    { kind: 'automatic', headSha, receiptId: 'push' },
    { kind: 'explicit-after-green-ci', headSha: 'e'.repeat(40), receiptId: 'user-comment:1' },
    { kind: 'explicit-after-green-ci', headSha, receiptId: '' }
  ]) {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ reviewInitiation }),
      action: { kind: 'review', actorRole: 'reviewer', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], mutationRequested: false }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'REVIEW_NOT_EXPLICITLY_INITIATED'), true);
  }
});

test('requires a concrete pinned head for legacy execution', () => {
  const legacy = {
    approvalReference: 'human-approved-existing-task',
    policySha,
    baseSha,
    assembledContextBudgetBytes: 32768,
    assembledContextActualBytes: 4096,
    assembledContextCheck: 'PASSED'
  };
  const result = evaluateTaskAction({
    handoff: legacy,
    runtime: runtime({
      currentHeadSha: undefined,
      diffEvidence: { baseSha, headSha: undefined, changedPaths: ['FLOW.md'], digest: diffDigest },
      legacyAllowedPaths: ['FLOW.md']
    }),
    action: { kind: 'execute', actorRole: 'executor', changedPaths: ['FLOW.md'] }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.findings.some(({ code }) => code === 'ACTION_HEAD_NOT_PINNED'), true);
});

test('requires the repository-defined required CI check set before review', () => {
  const missingGate = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime({ ci: { headSha, status: 'green', checks: [{ name: 'lint', status: 'green' }] } }),
    action: { kind: 'review', actorRole: 'reviewer', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], mutationRequested: false }
  });
  assert.equal(missingGate.allowed, false);
  assert.equal(missingGate.findings.some(({ code }) => code === 'CI_NOT_GREEN_FOR_HEAD'), true);

  const failedGate = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime({ ci: { headSha, status: 'green', checks: [{ name: 'verify', status: 'failed' }] } }),
    action: { kind: 'review', actorRole: 'reviewer', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], mutationRequested: false }
  });
  assert.equal(failedGate.allowed, false);
  assert.equal(failedGate.findings.some(({ code }) => code === 'CI_NOT_GREEN_FOR_HEAD'), true);
});

test('requires review scope to equal the complete authoritative diff', () => {
  const result = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime({
      diffEvidence: { baseSha, headSha, changedPaths: ['FLOW.md', 'global/reviewer.md'], digest: diffDigest }
    }),
    action: { kind: 'review', actorRole: 'reviewer', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], mutationRequested: false }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CHANGED_PATHS_MISMATCH'), true);
});

test('binds v2 execution to an active managed workspace record', () => {
  for (const workspaceRecord of [
    undefined,
    { repository: 'syllik/ai-workflow', access: 'managed', status: 'onboarding', integrationBranch },
    { repository: 'syllik/ai-workflow', access: 'read-only', status: 'active', integrationBranch },
    { repository: 'ChipIn-one/chipin-backend', access: 'managed', status: 'active', integrationBranch }
  ]) {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ workspaceRecord }),
      action: { kind: 'execute', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'] }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'WORKSPACE_TARGET_NOT_ACTIVE_MANAGED'), true);
  }
});

test('binds handoff required checks to an authoritative repository receipt', () => {
  for (const requiredCiReceipt of [
    undefined,
    { source: 'repository-config', repository: 'syllik/ai-workflow', integrationBranch, checks: ['lint'] },
    { source: 'repository-config', repository: 'syllik/other', integrationBranch, checks: requiredCiChecks },
    { source: 'untrusted', repository: 'syllik/ai-workflow', integrationBranch, checks: requiredCiChecks }
  ]) {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ requiredCiReceipt }),
      action: { kind: 'review', actorRole: 'reviewer', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], mutationRequested: false }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'CI_NOT_GREEN_FOR_HEAD'), true);
  }
});

test('fails closed for malformed legacy allowed-path evidence', () => {
  const legacy = {
    approvalReference: 'human-approved-existing-task',
    policySha,
    baseSha,
    assembledContextBudgetBytes: 32768,
    assembledContextActualBytes: 4096,
    assembledContextCheck: 'PASSED'
  };
  for (const legacyAllowedPaths of [[null], ['src/*.js'], ['../FLOW.md']]) {
    const result = evaluateTaskAction({
      handoff: legacy,
      runtime: runtime({ legacyAllowedPaths }),
      action: { kind: 'execute', actorRole: 'executor', expectedHeadSha: headSha, changedPaths: ['FLOW.md'] }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'INVALID_LEGACY_ALLOWED_PATHS'), true);
  }
});

test('rejects non-string repository and branch provenance fields', () => {
  const malformedValues = [
    { repository: ['syllik/ai-workflow'] },
    { taskBranch: ['fix/issue-1-x'] },
    { integrationBranch: ['master'] },
    { repository: { value: 'syllik/ai-workflow' } },
    { taskBranch: 42 },
    { integrationBranch: true }
  ];

  for (const overrides of malformedValues) {
    const result = validateTaskHandoff(handoff(overrides));
    assert.equal(result.valid, false);
  }

  assert.equal(
    validateTaskHandoff(handoff({ repository: ['syllik/ai-workflow'] }))
      .findings.some(({ code }) => code === 'INVALID_HANDOFF_REPOSITORY'),
    true
  );
  assert.equal(
    validateTaskHandoff(handoff({ taskBranch: ['fix/issue-1-x'] }))
      .findings.some(({ code }) => code === 'INVALID_TASK_BRANCH'),
    true
  );
  assert.equal(
    validateTaskHandoff(handoff({ integrationBranch: ['master'] }))
      .findings.some(({ code }) => code === 'INVALID_INTEGRATION_BRANCH'),
    true
  );
});

test('permits review and correction on the exact Trusted Publisher head', () => {
  const publishedRuntime = runtime({
    currentHeadSha: publishedHeadSha,
    publishedRevision: {
      source: 'trusted-publisher',
      repository: 'syllik/ai-workflow',
      taskBranch,
      policySha,
      baseSha,
      headSha: publishedHeadSha
    },
    ci: { headSha: publishedHeadSha, status: 'green', checks: [{ name: 'verify', status: 'green' }] },
    reviewInitiation: { kind: 'explicit-after-green-ci', headSha: publishedHeadSha, receiptId: 'user-comment:published' },
    diffEvidence: { baseSha, headSha: publishedHeadSha, changedPaths: ['FLOW.md'], digest: diffDigest }
  });

  const review = evaluateTaskAction({
    handoff: handoff(),
    runtime: publishedRuntime,
    action: { kind: 'review', actorRole: 'reviewer', expectedHeadSha: publishedHeadSha, changedPaths: ['FLOW.md'], mutationRequested: false }
  });
  assert.equal(review.allowed, true);

  const correction = evaluateTaskAction({
    handoff: handoff(),
    runtime: { ...publishedRuntime, reviewedHeadShas: [publishedHeadSha] },
    action: {
      kind: 'correct',
      actorRole: 'executor',
      expectedHeadSha: publishedHeadSha,
      changedPaths: ['FLOW.md'],
      findingsPackageCount: 1,
      findingsHeadSha: publishedHeadSha
    }
  });
  assert.equal(correction.allowed, true);
});

test('rejects post-publication actions without the exact Trusted Publisher receipt', () => {
  for (const publishedRevision of [
    undefined,
    { source: 'trusted-publisher', repository: 'syllik/ai-workflow', taskBranch, policySha, baseSha, headSha },
    { source: 'untrusted', repository: 'syllik/ai-workflow', taskBranch, policySha, baseSha, headSha: publishedHeadSha }
  ]) {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({
        currentHeadSha: publishedHeadSha,
        publishedRevision,
        ci: { headSha: publishedHeadSha, status: 'green', checks: [{ name: 'verify', status: 'green' }] },
        reviewInitiation: { kind: 'explicit-after-green-ci', headSha: publishedHeadSha, receiptId: 'user-comment:published' },
        diffEvidence: { baseSha, headSha: publishedHeadSha, changedPaths: ['FLOW.md'], digest: diffDigest }
      }),
      action: { kind: 'review', actorRole: 'reviewer', expectedHeadSha: publishedHeadSha, changedPaths: ['FLOW.md'], mutationRequested: false }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'PUBLISHED_REVISION_NOT_PINNED'), true);
  }
});

test('requires executor mutations on the assigned task branch', () => {
  for (const kind of ['execute', 'correct']) {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({
        currentBranch: integrationBranch,
        reviewedHeadShas: kind === 'correct' ? [headSha] : []
      }),
      action: {
        kind,
        actorRole: 'executor',
        expectedHeadSha: headSha,
        changedPaths: ['FLOW.md'],
        ...(kind === 'correct' ? { findingsPackageCount: 1, findingsHeadSha: headSha } : {})
      }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'TASK_BRANCH_MISMATCH'), true);
  }
});

test('permits correction publication from the current published revision head', () => {
  const result = evaluateTaskAction({
    handoff: handoff(),
    runtime: runtime({
      currentHeadSha: publishedHeadSha,
      publishedRevision: {
        source: 'trusted-publisher',
        repository: 'syllik/ai-workflow',
        taskBranch,
        policySha,
        baseSha,
        headSha: publishedHeadSha
      },
      localValidation: { headSha: publishedHeadSha, status: 'passed', diffDigest },
      diffEvidence: { baseSha, headSha: publishedHeadSha, changedPaths: ['FLOW.md'], digest: diffDigest }
    }),
    action: {
      kind: 'publish',
      actorRole: 'publisher',
      destinationBranch: taskBranch,
      pullRequestBaseBranch: integrationBranch,
      expectedHeadSha: publishedHeadSha,
      changedPaths: ['FLOW.md'],
      commitCount: 1,
      pushCount: 1,
      forcePush: false,
      historyRewrite: false
    }
  });
  assert.equal(result.allowed, true);
});
