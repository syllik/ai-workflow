import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadManifest, validateManifest } from '../scripts/workspace/manifest.mjs';
import { expectedProjects, fixtureManifest, makeFixtureRoot, removeFixtureRoot, writeFixtureManifest } from './helpers.mjs';

describe('manifest', () => {
  test('loads the canonical manifest with exactly the approved project records', () => {
    const root = makeFixtureRoot();
    try {
      const manifestPath = writeFixtureManifest(root);
      const manifest = loadManifest(manifestPath);
      const result = validateManifest(manifest);

      assert.equal(result.valid, true);
      assert.deepEqual(result.findings, []);
      assert.deepEqual(manifest.projects, expectedProjects);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('accepts a new valid approved repository entry without source enumeration', () => {
    const manifest = fixtureManifest({
      projects: [...fixtureManifest().projects, {
        id: 'syllik/new-approved-repository',
        repository: 'syllik/new-approved-repository',
        localPath: 'tools/new-approved-repository',
        group: 'tools',
        access: 'managed',
        status: 'onboarding',
        integrationBranch: 'main',
        contextPath: '.ai/context.md'
      }]
    });

    const result = validateManifest(manifest);

    assert.equal(result.valid, true);
    assert.deepEqual(result.findings, []);
  });

  test('requires a safe explicit integration branch for every project', () => {
    const manifest = fixtureManifest();
    delete manifest.projects[0].integrationBranch;
    manifest.projects[1].integrationBranch = '../dev';

    const result = validateManifest(manifest);

    assert.deepEqual(result.findings.filter(({ code }) => code === 'INVALID_INTEGRATION_BRANCH').map(({ path }) => path), [
      'manifest.projects[0].integrationBranch',
      'manifest.projects[1].integrationBranch'
    ]);
  });

  test('accepts explicit read-only context dependencies and rejects unsafe dependency declarations', () => {
    const valid = fixtureManifest();
    valid.projects[2].contextDependencies = [{
      repository: 'ChipIn-one/chipin-knowledge-base',
      integrationBranch: 'main',
      access: 'read-only'
    }];
    assert.deepEqual(validateManifest(valid).findings, []);

    const invalid = fixtureManifest();
    invalid.projects[2].contextDependencies = [
      { repository: invalid.projects[2].repository, integrationBranch: '../main', access: 'managed' },
      { repository: invalid.projects[2].repository, integrationBranch: 'main', access: 'read-only' }
    ];
    const codes = validateManifest(invalid).findings.map(({ code }) => code);
    assert.equal(codes.includes('INVALID_DEPENDENCY_BRANCH'), true);
    assert.equal(codes.includes('INVALID_DEPENDENCY_ACCESS'), true);
    assert.equal(codes.includes('SELF_CONTEXT_DEPENDENCY'), true);
    assert.equal(codes.includes('DUPLICATE_CONTEXT_DEPENDENCY'), true);
  });

  test('rejects excluded repositories used as context dependencies', () => {
    const manifest = fixtureManifest();
    manifest.projects[2].contextDependencies = [{
      repository: 'tangem/private-context',
      integrationBranch: 'main',
      access: 'read-only'
    }];

    const result = validateManifest(manifest);

    assert.equal(result.valid, false);
    assert.deepEqual(result.findings.filter(({ code }) => code === 'EXCLUDED_REPOSITORY').map(({ path }) => path), [
      'manifest.projects[2].contextDependencies[0].repository'
    ]);
  });

  test('rejects context dependencies that alias managed workspace projects', () => {
    const manifest = fixtureManifest();
    manifest.projects[2].contextDependencies = [{
      repository: 'syllik/syllik',
      integrationBranch: 'master',
      access: 'read-only'
    }];

    const result = validateManifest(manifest);

    assert.equal(result.valid, false);
    assert.deepEqual(result.findings.filter(({ code }) => code === 'MANAGED_CONTEXT_DEPENDENCY').map(({ path }) => path), [
      'manifest.projects[2].contextDependencies[0].repository'
    ]);
  });

  test('rejects unknown keys at every manifest level', () => {
    const manifest = fixtureManifest({ unexpected: true });
    manifest.projects[0].extra = true;
    manifest.budgets.extra = 1;
    const result = validateManifest(manifest);
    assert.deepEqual(result.findings.filter(({ code }) => code === 'UNKNOWN_KEY').map(({ code, path }) => ({ code, path })), [
      { code: 'UNKNOWN_KEY', path: 'manifest.unexpected' },
      { code: 'UNKNOWN_KEY', path: 'manifest.budgets.extra' },
      { code: 'UNKNOWN_KEY', path: 'manifest.projects[0].extra' }
    ]);
  });

  test('rejects duplicate ids, repositories, and local paths', () => {
    const manifest = fixtureManifest();
    manifest.projects[1].id = manifest.projects[0].id;
    manifest.projects[1].repository = manifest.projects[0].repository;
    manifest.projects[1].localPath = manifest.projects[0].localPath;
    const result = validateManifest(manifest);
    assert.deepEqual(result.findings.filter(({ code }) => code.startsWith('DUPLICATE_')).map(({ code, path }) => ({ code, path })), [
      { code: 'DUPLICATE_ID', path: 'manifest.projects[1].id' },
      { code: 'DUPLICATE_REPOSITORY', path: 'manifest.projects[1].repository' },
      { code: 'DUPLICATE_LOCAL_PATH', path: 'manifest.projects[1].localPath' }
    ]);
  });

  test('rejects unsafe and non-POSIX paths', () => {
    const manifest = fixtureManifest();
    manifest.projects[0].localPath = '../outside';
    manifest.projects[1].localPath = 'products\\chipin';
    manifest.projects[2].localPath = '/absolute';
    const result = validateManifest(manifest);
    assert.deepEqual(result.findings.filter(({ code }) => code === 'UNSAFE_PATH').map(({ code, path }) => ({ code, path })), [
      { code: 'UNSAFE_PATH', path: 'manifest.projects[0].localPath' },
      { code: 'UNSAFE_PATH', path: 'manifest.projects[1].localPath' },
      { code: 'UNSAFE_PATH', path: 'manifest.projects[2].localPath' }
    ]);
  });

  test('rejects invalid access/status/context combinations', () => {
    const manifest = fixtureManifest();
    manifest.projects[0].contextPath = undefined;
    delete manifest.projects[0].contextPath;
    manifest.projects[1].access = 'read-only';
    manifest.projects[1].status = 'active';
    manifest.projects[1].contextPath = '.ai/context.md';
    manifest.projects[2].status = 'onboarding';
    const result = validateManifest(manifest);
    assert.deepEqual(result.findings.filter(({ code }) => ['MANAGED_CONTEXT_REQUIRED', 'READ_ONLY_CONTEXT_FORBIDDEN', 'INVALID_COMBINATION'].includes(code)).map(({ code, path }) => ({ code, path })), [
      { code: 'MANAGED_CONTEXT_REQUIRED', path: 'manifest.projects[0].contextPath' },
      { code: 'READ_ONLY_CONTEXT_FORBIDDEN', path: 'manifest.projects[1].contextPath' },
      { code: 'INVALID_COMBINATION', path: 'manifest.projects[2].status' }
    ]);
  });

  test('requires the exact managed context path and accepts the approved path', () => {
    const customPath = fixtureManifest({ projects: [{ ...fixtureManifest().projects[0], contextPath: 'docs/context.md' }] });
    const rejected = validateManifest(customPath);
    assert.deepEqual(rejected.findings.filter(({ path }) => path === 'manifest.projects[0].contextPath'), [
      { code: 'MANAGED_CONTEXT_PATH_INVALID', path: 'manifest.projects[0].contextPath' }
    ]);

    const accepted = validateManifest(fixtureManifest({ projects: [fixtureManifest().projects[0]] }));
    assert.equal(accepted.valid, true);
  });

  test('rejects excluded repositories', () => {
    const manifest = fixtureManifest();
    manifest.projects[0].repository = 'tangem/example';
    const result = validateManifest(manifest);
    assert.equal(result.findings.some((finding) => finding.code === 'EXCLUDED_REPOSITORY'), true);
  });
});
