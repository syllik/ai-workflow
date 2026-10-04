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

function handoff(overrides = {}) {
  return {
    contractVersion: 2,
    taskId: 'policy-contract',
    repository: 'syllik/ai-workflow',
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
    currentPolicySha: policySha,
    currentBaseSha: baseSha,
    currentHeadSha: headSha,
    publicationBatchesForRevision: 0,
    correctionBatchesUsed: 0,
    reviewedHeadShas: [],
    reviewInProgressHeadShas: [],
    executorContextId: 'executor-1',
    reviewerContextId: 'reviewer-1',
    ci: { headSha, status: 'green' },
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
      runtime: runtime(),
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
      action: { kind: 'review', actorRole: 'reviewer', expectedHeadSha: headSha, changedPaths: [], mutationRequested: false }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.findings.some(({ code }) => code === 'DUPLICATE_REVIEW'), true);
  });

  test('rejects a review already running for the same SHA', () => {
    const result = evaluateTaskAction({
      handoff: handoff(),
      runtime: runtime({ reviewInProgressHeadShas: [headSha] }),
      action: { kind: 'review', actorRole: 'reviewer', expectedHeadSha: headSha, changedPaths: [], mutationRequested: false }
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
      action: { kind: 'publish', actorRole: 'publisher', expectedHeadSha: headSha, changedPaths: ['FLOW.md'], commitCount: 1, pushCount: 1, forcePush: false, historyRewrite: false }
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
