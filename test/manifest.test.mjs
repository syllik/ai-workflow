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

  test('rejects excluded repositories and a non-canonical project set', () => {
    const manifest = fixtureManifest({ projects: fixtureManifest().projects.slice(0, 7) });
    manifest.projects[0].repository = 'tangem/example';
    const result = validateManifest(manifest);
    assert.equal(result.findings.some((finding) => finding.code === 'EXCLUDED_REPOSITORY'), true);
    assert.equal(result.findings.some((finding) => finding.code === 'PROJECT_SET_MISMATCH'), true);
  });
});
