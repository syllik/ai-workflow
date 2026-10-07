import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTaskContextPackage } from '../scripts/workspace/context-producer.mjs';

const policySha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const headSha = 'c'.repeat(40);
const dependencySha = 'd'.repeat(40);

function canonicalSources() {
  return [
    { kind: 'policy', repository: 'syllik/ai-workflow', path: 'AI.md', revisionSha: policySha, expectedRevisionSha: policySha, content: '# entry\n' },
    { kind: 'policy', repository: 'syllik/ai-workflow', path: 'FLOW.md', revisionSha: policySha, expectedRevisionSha: policySha, content: '# flow\n' },
    { kind: 'policy', repository: 'syllik/ai-workflow', path: 'workspace.yaml', revisionSha: policySha, expectedRevisionSha: policySha, content: [
      'schemaVersion: 2',
      'projects:',
      '  - id: ChipIn-one/chipin-frontend',
      '    repository: ChipIn-one/chipin-frontend',
      '    contextDependencies:',
      '      - repository: ChipIn-one/chipin-knowledge-base',
      ''
    ].join('\n') },
    { kind: 'policy', repository: 'syllik/ai-workflow', path: 'projects/index.md', revisionSha: policySha, expectedRevisionSha: policySha, content: '# projects\n' },
    { kind: 'policy', repository: 'syllik/ai-workflow', path: 'global/workflow.md', revisionSha: policySha, expectedRevisionSha: policySha, content: '# roles\n' },
    { kind: 'role', repository: 'syllik/ai-workflow', path: 'global/executor.md', revisionSha: policySha, expectedRevisionSha: policySha, content: '# executor\n' },
    { kind: 'target', repository: 'ChipIn-one/chipin-frontend', path: 'AGENTS.md', revisionSha: headSha, expectedRevisionSha: headSha, content: '# rules\n' },
    { kind: 'target', repository: 'ChipIn-one/chipin-frontend', path: '.ai/context.md', revisionSha: headSha, expectedRevisionSha: headSha, content: '# context\n' },
    { kind: 'dependency', repository: 'ChipIn-one/chipin-knowledge-base', path: 'common/specs/dashboard.md', revisionSha: dependencySha, expectedRevisionSha: dependencySha, content: '**DSH-001** behavior\n', requirementIds: ['DSH-001'] }
  ];
}

function expectedSources(sources) {
  return sources.map(({ kind, repository, path, revisionSha }) => ({ kind, repository, path, revisionSha }));
}

function input(overrides = {}) {
  const sources = canonicalSources();
  return {
    policySha,
    baseSha,
    headSha,
    acceptance: { text: 'Use exact-SHA context and fail closed.' },
    requirementIds: ['DSH-001'],
    expectedSources: expectedSources(sources),
    dependencies: [{ repository: 'ChipIn-one/chipin-knowledge-base', revisionSha: dependencySha, expectedRevisionSha: dependencySha }],
    sources,
    ...overrides
  };
}

function sourceByPath(value, path) {
  return value.sources.find((source) => source.path === path);
}

function expectedSourceByPath(value, path) {
  return value.expectedSources.find((source) => source.path === path);
}

test('builds a deterministic minimal handoff with complete expected sources, exact dependency SHA and UTF-8 byte provenance', () => {
  const first = buildTaskContextPackage(input());
  const second = buildTaskContextPackage(input());
  assert.equal(first.passed, true);
  assert.deepEqual(second, first);
  assert.equal(first.manifest.expectedSources.length, 9);
  assert.equal(first.manifest.dependencies[0].revisionSha, dependencySha);
  assert.equal(first.handoffProvenance.assembledContextBudgetBytes, 32768);
  assert.equal(first.handoffProvenance.assembledContextActualBytes, Buffer.byteLength(first.assembledContext, 'utf8'));
  assert.equal(first.handoffProvenance.assembledContextCheck, 'PASSED');
  assert.match(first.manifest.assembledContextSha256, /^[0-9a-f]{64}$/u);
});

test('blocks a missing mandatory source from the explicit expected-source set', () => {
  const value = input();
  value.sources = value.sources.filter(({ path }) => path !== 'AI.md');
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code, expected }) =>
    code === 'CONTEXT_EXPECTED_SOURCE_UNAVAILABLE' && expected?.path === 'AI.md'), true);
});

test('requires a non-empty explicit expected-source set', () => {
  const result = buildTaskContextPackage(input({ expectedSources: [] }));
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_EXPECTED_SOURCES_UNAVAILABLE'), true);
});

test('rejects a caller-declared subset that omits a canonical mandatory identity', () => {
  const value = input();
  value.sources = value.sources.filter(({ path }) => path !== 'AI.md');
  value.expectedSources = value.expectedSources.filter(({ path }) => path !== 'AI.md');
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code, path }) =>
    code === 'CONTEXT_CANONICAL_SOURCE_UNAVAILABLE' && path === 'canonical.policy.AI.md'), true);
});

test('requires one selected role and one coherent target instruction pair', () => {
  const missingRole = input();
  missingRole.sources = missingRole.sources.filter(({ kind }) => kind !== 'role');
  missingRole.expectedSources = missingRole.expectedSources.filter(({ kind }) => kind !== 'role');
  const roleResult = buildTaskContextPackage(missingRole);
  assert.equal(roleResult.passed, false);
  assert.equal(roleResult.findings.some(({ code }) => code === 'CONTEXT_CANONICAL_ROLE_INVALID'), true);

  const mixedTarget = input();
  expectedSourceByPath(mixedTarget, '.ai/context.md').revisionSha = baseSha;
  sourceByPath(mixedTarget, '.ai/context.md').revisionSha = baseSha;
  sourceByPath(mixedTarget, '.ai/context.md').expectedRevisionSha = baseSha;
  const targetResult = buildTaskContextPackage(mixedTarget);
  assert.equal(targetResult.passed, false);
  assert.equal(targetResult.findings.some(({ code }) => code === 'CONTEXT_TARGET_SOURCE_SET_MISMATCH'), true);
});

test('binds both target instruction sources to the handoff head SHA', () => {
  const stale = 'e'.repeat(40);
  const value = input();
  for (const path of ['AGENTS.md', '.ai/context.md']) {
    expectedSourceByPath(value, path).revisionSha = stale;
    sourceByPath(value, path).revisionSha = stale;
    sourceByPath(value, path).expectedRevisionSha = stale;
  }
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code, expectedRevisionSha }) =>
    code === 'CONTEXT_TARGET_SOURCE_SET_MISMATCH' && expectedRevisionSha === headSha), true);
});

test('rejects an arbitrary policy-revision file as the selected role', () => {
  const value = input();
  sourceByPath(value, 'global/executor.md').path = 'README.md';
  expectedSourceByPath(value, 'global/executor.md').path = 'README.md';
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_CANONICAL_ROLE_INVALID'), true);
});

test('rejects canonical policy and role identities from a non-canonical repository', () => {
  const value = input();
  for (const source of value.sources) {
    if (source.kind === 'policy' || source.kind === 'role') source.repository = 'evil/fork';
  }
  for (const source of value.expectedSources) {
    if (source.kind === 'policy' || source.kind === 'role') source.repository = 'evil/fork';
  }
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code, path }) =>
    code === 'CONTEXT_CANONICAL_SOURCE_UNAVAILABLE' && path === 'canonical.policy.AI.md'), true);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_CANONICAL_ROLE_INVALID'), true);
});

test('requires contextDependencies declared by the pinned target workspace record', () => {
  const value = input();
  value.dependencies = [];
  value.sources = value.sources.filter(({ repository }) => repository !== 'ChipIn-one/chipin-knowledge-base');
  value.expectedSources = value.expectedSources.filter(({ repository }) => repository !== 'ChipIn-one/chipin-knowledge-base');
  value.requirementIds = [];
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code, path }) =>
    code === 'CONTEXT_DEPENDENCY_UNAVAILABLE'
    && path === 'workspace.contextDependencies.ChipIn-one/chipin-knowledge-base'), true);
});

test('resolves contextDependencies only from the canonical workspace source at policySha', () => {
  const value = input();
  value.dependencies = [];
  value.sources = value.sources.filter(({ repository }) => repository !== 'ChipIn-one/chipin-knowledge-base');
  value.expectedSources = value.expectedSources.filter(({ repository }) => repository !== 'ChipIn-one/chipin-knowledge-base');
  value.requirementIds = [];

  const forkWorkspace = {
    kind: 'policy',
    repository: 'evil/fork',
    path: 'workspace.yaml',
    revisionSha: policySha,
    expectedRevisionSha: policySha,
    content: [
      'schemaVersion: 2',
      'projects:',
      '  - id: ChipIn-one/chipin-frontend',
      '    repository: ChipIn-one/chipin-frontend',
      ''
    ].join('\n')
  };
  value.sources.unshift(forkWorkspace);
  value.expectedSources.unshift({
    kind: forkWorkspace.kind,
    repository: forkWorkspace.repository,
    path: forkWorkspace.path,
    revisionSha: forkWorkspace.revisionSha
  });

  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code, path }) =>
    code === 'CONTEXT_DEPENDENCY_UNAVAILABLE'
    && path === 'workspace.contextDependencies.ChipIn-one/chipin-knowledge-base'), true);
});

test('rejects dependencies that are not declared by the canonical target workspace record', () => {
  const value = input();
  const extraSha = 'f'.repeat(40);
  value.dependencies.push({
    repository: 'Other/approved-looking-repo',
    revisionSha: extraSha,
    expectedRevisionSha: extraSha
  });
  value.sources.push({
    kind: 'dependency',
    repository: 'Other/approved-looking-repo',
    path: 'README.md',
    revisionSha: extraSha,
    expectedRevisionSha: extraSha,
    content: 'extra dependency context\n'
  });
  value.expectedSources.push({
    kind: 'dependency',
    repository: 'Other/approved-looking-repo',
    path: 'README.md',
    revisionSha: extraSha
  });

  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code, path }) =>
    code === 'CONTEXT_DEPENDENCY_UNEXPECTED'
    && path === 'dependencies.Other/approved-looking-repo'), true);
});

test('rejects additional non-canonical role sources even when the canonical role is present', () => {
  const value = input();
  value.sources.push({
    kind: 'role',
    repository: 'evil/fork',
    path: 'global/executor.md',
    revisionSha: policySha,
    expectedRevisionSha: policySha,
    content: '# conflicting role\n'
  });
  value.expectedSources.push({
    kind: 'role',
    repository: 'evil/fork',
    path: 'global/executor.md',
    revisionSha: policySha
  });

  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_CANONICAL_ROLE_INVALID'), true);
});

test('treats dependency repository casing aliases as one exact dependency identity', () => {
  const value = input();
  value.dependencies.push({
    repository: 'chipin-one/chipin-knowledge-base',
    revisionSha: 'e'.repeat(40),
    expectedRevisionSha: 'e'.repeat(40)
  });
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_DEPENDENCY_DUPLICATE'), true);
});

test('binds central policy and role sources to policySha without forcing target sources onto that SHA', () => {
  const stale = 'e'.repeat(40);
  const value = input();
  sourceByPath(value, 'global/executor.md').revisionSha = stale;
  sourceByPath(value, 'global/executor.md').expectedRevisionSha = stale;
  expectedSourceByPath(value, 'global/executor.md').revisionSha = stale;
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code, expected, actual }) =>
    code === 'CONTEXT_POLICY_SHA_MISMATCH' && expected === policySha && actual === stale), true);

  const target = input();
  assert.equal(sourceByPath(target, 'AGENTS.md').revisionSha, headSha);
  assert.equal(buildTaskContextPackage(target).passed, true);
});

test('rejects duplicate actual sources even when their metadata key is identical', () => {
  const value = input();
  const duplicate = { ...sourceByPath(value, 'common/specs/dashboard.md'), content: '**DSH-001** conflicting body\n' };
  value.sources.push(duplicate);
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_SOURCE_DUPLICATE'), true);
  assert.equal(result.manifest.sources.filter(({ path }) => path === 'common/specs/dashboard.md').length, 1);
});

test('treats GitHub repository casing aliases as the same source identity', () => {
  const value = input();
  const original = sourceByPath(value, 'common/specs/dashboard.md');
  value.sources.push({
    ...original,
    repository: original.repository.toLowerCase(),
    content: '**DSH-001** conflicting case-alias body\n'
  });
  value.expectedSources.push({
    ...expectedSourceByPath(value, 'common/specs/dashboard.md'),
    repository: original.repository.toLowerCase()
  });
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) =>
    code === 'CONTEXT_EXPECTED_SOURCE_DUPLICATE' || code === 'CONTEXT_SOURCE_DUPLICATE'), true);
});

test('rejects undeclared actual sources outside the expected-source set', () => {
  const value = input();
  value.sources.push({
    kind: 'dependency',
    repository: 'Other/repository',
    path: 'README.md',
    revisionSha: 'f'.repeat(40),
    expectedRevisionSha: 'f'.repeat(40),
    content: 'undeclared context\n'
  });
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_SOURCE_UNEXPECTED'), true);
});

test('blocks unavailable required dependency context', () => {
  const value = input();
  value.sources = value.sources.filter(({ repository }) => repository !== 'ChipIn-one/chipin-knowledge-base');
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_DEPENDENCY_UNAVAILABLE'), true);
});

test('blocks whitespace-only required source content', () => {
  const value = input();
  sourceByPath(value, 'common/specs/dashboard.md').content = ' \n\t ';
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code, path }) =>
    code === 'CONTEXT_SOURCE_UNAVAILABLE' && path.endsWith('.content')), true);
});

test('preserves original whitespace for valid source hashing and assembly', () => {
  const value = input();
  sourceByPath(value, 'common/specs/dashboard.md').content = ' \n**DSH-001** behavior\n\t ';
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, true);
  assert.equal(result.assembledContext.includes(sourceByPath(value, 'common/specs/dashboard.md').content), true);
  const manifestSource = result.manifest.sources.find(({ path }) => path === 'common/specs/dashboard.md');
  assert.equal(manifestSource.bytes, Buffer.byteLength(sourceByPath(value, 'common/specs/dashboard.md').content, 'utf8'));
});

test('blocks whitespace-only acceptance while preserving valid acceptance verbatim', () => {
  const blank = buildTaskContextPackage(input({ acceptance: { text: ' \n\t ' } }));
  assert.equal(blank.passed, false);
  assert.equal(blank.findings.some(({ code }) => code === 'CONTEXT_ACCEPTANCE_UNAVAILABLE'), true);

  const original = ' \nKeep this exact acceptance text.\n\t ';
  const valid = buildTaskContextPackage(input({ acceptance: { text: original } }));
  assert.equal(valid.passed, true);
  assert.equal(valid.assembledContext.includes(original), true);
  assert.equal(valid.manifest.acceptance.bytes, Buffer.byteLength(original, 'utf8'));
});

test('blocks stale source and dependency revisions', () => {
  const stale = 'e'.repeat(40);
  const value = input();
  value.dependencies[0].revisionSha = stale;
  sourceByPath(value, 'common/specs/dashboard.md').revisionSha = stale;
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_DEPENDENCY_STALE'), true);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_SOURCE_STALE'), true);
});

test('blocks a required requirement id that is not represented by selected context', () => {
  const value = input();
  sourceByPath(value, 'common/specs/dashboard.md').requirementIds = [];
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_REQUIREMENT_UNAVAILABLE'), true);
});

test('blocks oversize context without truncating required documents', () => {
  const value = input();
  const marker = 'REQUIRED_DOCUMENT_TAIL';
  sourceByPath(value, 'common/specs/dashboard.md').content = `${'x'.repeat(40000)}${marker}`;
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'ASSEMBLED_CONTEXT_BUDGET_EXCEEDED'), true);
  assert.equal(result.handoffProvenance.assembledContextActualBytes > 32768, true);
  assert.equal(result.assembledContext.includes(marker), true);
});

test('counts multibyte context as UTF-8 bytes rather than characters', () => {
  const value = input({ acceptance: { text: '🙂' } });
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, true);
  assert.equal(result.manifest.acceptance.bytes, 4);
  assert.equal(result.handoffProvenance.assembledContextActualBytes, Buffer.byteLength(result.assembledContext, 'utf8'));
});
