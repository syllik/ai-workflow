import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fixtureManifest, git, initFixtureRepo, makeFixtureRoot, removeFixtureRoot, writeFixtureManifest } from './helpers.mjs';
import { renderAgentsBlock, renderManagedContextBlock } from '../scripts/workspace/render.mjs';
import { parseArgs } from '../scripts/workspace/cli.mjs';

const cli = path.resolve('scripts/workspace/cli.mjs');

function runCli(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

describe('workspace CLI', () => {
  test('resolves the default manifest from the ai-workflow checkout, not the target root', () => {
    const workspaceRoot = makeFixtureRoot();
    try {
      const result = runCli('check', '--root', workspaceRoot, '--manifest-only');
      assert.equal(result.status, 0, result.stderr);
    } finally {
      removeFixtureRoot(workspaceRoot);
    }
  });

  test('resolves an explicit manifest independently from a distinct target root', () => {
    const manifestRoot = makeFixtureRoot();
    const workspaceRoot = makeFixtureRoot();
    try {
      const manifestPath = writeFixtureManifest(manifestRoot);
      const options = parseArgs(['check', '--root', workspaceRoot, '--manifest', manifestPath, '--manifest-only']);
      assert.equal(options.root, path.resolve(workspaceRoot));
      assert.equal(options.manifestPath, path.resolve(manifestPath));
      const result = runCli('check', '--root', workspaceRoot, '--manifest', manifestPath, '--manifest-only');
      assert.equal(result.status, 0, result.stderr);
    } finally {
      removeFixtureRoot(manifestRoot);
      removeFixtureRoot(workspaceRoot);
    }
  });

  test('manifest-only check returns zero for a valid isolated manifest', () => {
    const root = makeFixtureRoot();
    try {
      const manifestPath = writeFixtureManifest(root);
      const result = runCli('check', '--root', root, '--manifest', manifestPath, '--manifest-only');
      assert.equal(result.status, 0, result.stderr);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('validation failures return one and unsafe operations return two', () => {
    const root = makeFixtureRoot();
    try {
      const invalid = fixtureManifest({ schemaVersion: 0 });
      const manifestPath = writeFixtureManifest(root, invalid);
      const validation = runCli('check', '--root', root, '--manifest', manifestPath, '--manifest-only');
      assert.equal(validation.status, 1);

      writeFixtureManifest(root);
      mkdirSync(path.join(root, 'profile/syllik'), { recursive: true });
      writeFileSync(path.join(root, 'profile/syllik/occupied.txt'), 'occupied\n');
      const blocked = runCli('apply', '--root', root, '--manifest', path.join(root, 'workspace.yaml'));
      assert.equal(blocked.status, 2);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('rejects unknown commands and malformed command boundaries', () => {
    assert.equal(runCli('unknown').status, 1);
    assert.equal(runCli('check', '--manifest-only', '--bogus').status, 1);
    assert.equal(runCli('plan', '--root').status, 1);
  });

  test('apply returns one and performs no work when generated files drift', () => {
    const root = makeFixtureRoot();
    try {
      const manifest = fixtureManifest();
      for (const project of manifest.projects) {
        const projectPath = path.join(root, project.localPath);
        initFixtureRepo(projectPath, `https://github.com/${project.repository}.git`);
        if (project.access === 'managed') {
          mkdirSync(path.join(projectPath, '.ai'), { recursive: true });
          writeFileSync(path.join(projectPath, project.contextPath), renderManagedContextBlock(project), 'utf8');
          git(projectPath, 'add', project.contextPath);
          git(projectPath, 'commit', '--quiet', '-m', 'context');
        }
      }
      const manifestPath = writeFixtureManifest(root, manifest);
      writeFileSync(path.join(root, 'AGENTS.md'), renderAgentsBlock(manifest), 'utf8');
      mkdirSync(path.join(root, 'projects'), { recursive: true });
      writeFileSync(path.join(root, 'projects/index.md'), 'drift\n', 'utf8');
      const result = runCli('apply', '--root', root, '--manifest', manifestPath);
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stderr.includes('GENERATED_DRIFT'), true);
      assert.equal(result.stderr.includes('APPLY_FAILED'), false);
    } finally {
      removeFixtureRoot(root);
    }
  });
});
