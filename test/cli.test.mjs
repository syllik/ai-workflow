import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fixtureManifest, git, initFixtureRepo, makeFixtureRoot, removeFixtureRoot, writeFixtureManifest } from './helpers.mjs';
import { renderAgentsBlock, renderContextScaffold, renderManagedBlock, renderProjectIndex } from '../scripts/workspace/render.mjs';
import { planWorkspace } from '../scripts/workspace/operations.mjs';
import { parseArgs, run as runWorkspaceCli } from '../scripts/workspace/cli.mjs';

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

  test('check resolves generated index beside an explicit manifest and repository-local contracts beside the target root', () => {
    const manifestRoot = makeFixtureRoot();
    const root = makeFixtureRoot();
    try {
      const manifest = fixtureManifest({ projects: [fixtureManifest().projects[1]] });
      const projectPath = path.join(root, manifest.projects[0].localPath);
      initFixtureRepo(projectPath, 'https://github.com/ChipIn-one/chipin-frontend.git');
      mkdirSync(path.join(projectPath, '.ai'), { recursive: true });
      writeFileSync(path.join(projectPath, manifest.projects[0].contextPath), renderContextScaffold(manifest.projects[0]), 'utf8');
      writeFileSync(path.join(projectPath, '.ai/decisions.md'), '# Decisions\n\nRecord durable decisions for this repository here.\n', 'utf8');
      writeFileSync(path.join(projectPath, 'AGENTS.md'), renderAgentsBlock(manifest), 'utf8');
      const manifestPath = writeFixtureManifest(manifestRoot, manifest);
      mkdirSync(path.join(manifestRoot, 'projects'), { recursive: true });
      writeFileSync(path.join(manifestRoot, 'projects/index.md'), renderProjectIndex(manifest), 'utf8');
      writeFileSync(path.join(manifestRoot, 'AGENTS.md'), renderAgentsBlock(manifest), 'utf8');
      const result = runCli('check', '--root', root, '--manifest', manifestPath);
      assert.equal(result.status, 0, result.stderr);
    } finally {
      removeFixtureRoot(manifestRoot);
      removeFixtureRoot(root);
    }
  });

  test('checks the central checkout AGENTS block relative to the manifest directory', () => {
    const root = makeFixtureRoot();
    try {
      const manifest = fixtureManifest({ projects: [] });
      const manifestPath = writeFixtureManifest(root, manifest);
      mkdirSync(path.join(root, 'projects'), { recursive: true });
      writeFileSync(path.join(root, 'projects/index.md'), renderProjectIndex(manifest), 'utf8');
      writeFileSync(path.join(root, 'AGENTS.md'), renderManagedBlock('agents-routing', 'Read `FLOW.md`.\n'), 'utf8');

      const stale = runCli('check', '--root', root, '--manifest', manifestPath);
      assert.equal(stale.status, 1, stale.stderr);
      assert.match(stale.stderr, /GENERATED_DRIFT.*AGENTS\.md/u);

      writeFileSync(path.join(root, 'AGENTS.md'), renderAgentsBlock(manifest), 'utf8');
      const restored = runCli('check', '--root', root, '--manifest', manifestPath);
      assert.equal(restored.status, 0, restored.stderr);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('does not duplicate central AGENTS drift when it is the canonical target repository', () => {
    const root = makeFixtureRoot();
    try {
      const manifestRoot = path.join(root, 'workflows/ai/ai-workflow');
      mkdirSync(path.join(manifestRoot, '.ai'), { recursive: true });
      const project = { ...fixtureManifest().projects[0], localPath: 'workflows/ai/ai-workflow' };
      const manifest = fixtureManifest({ projects: [project] });
      const manifestPath = writeFixtureManifest(manifestRoot, manifest);
      mkdirSync(path.join(manifestRoot, 'projects'), { recursive: true });
      writeFileSync(path.join(manifestRoot, 'projects/index.md'), renderProjectIndex(manifest), 'utf8');
      writeFileSync(path.join(manifestRoot, 'AGENTS.md'), renderManagedBlock('agents-routing', 'stale\\n'), 'utf8');
      writeFileSync(path.join(manifestRoot, project.contextPath), renderContextScaffold(project), 'utf8');
      writeFileSync(path.join(manifestRoot, '.ai/decisions.md'), '# Decisions\\n', 'utf8');

      const result = runCli('check', '--root', root, '--manifest', manifestPath);
      const agentsFindings = JSON.parse(result.stderr).filter(({ path: findingPath }) => findingPath.endsWith('/AGENTS.md') || findingPath === 'AGENTS.md');
      assert.deepEqual(agentsFindings, [{ code: 'GENERATED_DRIFT', path: 'AGENTS.md' }]);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('rejects a non-canonical managed context path before plan or apply', () => {
    const root = makeFixtureRoot();
    try {
      const project = { ...fixtureManifest().projects[0], contextPath: 'docs/context.md' };
      const manifestPath = writeFixtureManifest(root, fixtureManifest({ projects: [project] }));
      assert.equal(runCli('plan', '--root', root, '--manifest', manifestPath).status, 1);
      assert.equal(runCli('apply', '--root', root, '--manifest', manifestPath).status, 1);
      assert.equal(readdirSync(root).includes(project.localPath.split('/')[0]), false);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('one apply invocation clones and scaffolds a missing managed repository to convergence', () => {
    const root = makeFixtureRoot();
    const remoteRoot = makeFixtureRoot();
    try {
      const project = fixtureManifest().projects[0];
      const manifest = fixtureManifest({ projects: [project] });
      const remote = path.join(remoteRoot, 'syllik');
      initFixtureRepo(remote, `https://github.com/${project.repository}.git`);
      const manifestPath = writeFixtureManifest(root, manifest);
      const status = runWorkspaceCli(['apply', '--root', root, '--manifest', manifestPath], {
        cloneSource: () => remote,
        expectedRemote: () => remote
      });
      const repositoryPath = path.join(root, project.localPath);

      assert.equal(status, 0);
      assert.equal(readFileSync(path.join(repositoryPath, 'AGENTS.md'), 'utf8'), renderAgentsBlock(manifest));
      assert.match(readFileSync(path.join(repositoryPath, project.contextPath), 'utf8'), /^# Project\n/u);
      assert.equal(readFileSync(path.join(repositoryPath, '.ai/decisions.md'), 'utf8'), '# Decisions\n\nRecord durable decisions for this repository here.\n');
      assert.deepEqual(planWorkspace({ root, manifestPath, manifest, expectedRemote: () => remote }).operations, []);
    } finally {
      removeFixtureRoot(remoteRoot);
      removeFixtureRoot(root);
    }
  });

  test('one apply invocation clones a missing read-only repository without writing contracts', () => {
    const root = makeFixtureRoot();
    const remoteRoot = makeFixtureRoot();
    try {
      const project = fixtureManifest().projects[2];
      const manifest = fixtureManifest({ projects: [project] });
      const remote = path.join(remoteRoot, 'backend');
      initFixtureRepo(remote, `https://github.com/${project.repository}.git`);
      const manifestPath = writeFixtureManifest(root, manifest);
      const status = runWorkspaceCli(['apply', '--root', root, '--manifest', manifestPath], {
        cloneSource: () => remote,
        expectedRemote: () => remote
      });
      const repositoryPath = path.join(root, project.localPath);

      assert.equal(status, 0);
      assert.deepEqual(readdirSync(repositoryPath).sort(), ['.git', '.keep']);
      assert.deepEqual(planWorkspace({ root, manifestPath, manifest, expectedRemote: () => remote }).operations, []);
    } finally {
      removeFixtureRoot(remoteRoot);
      removeFixtureRoot(root);
    }
  });
});
