import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fixtureManifest, git, initCentralManifestRepo, initFixtureRepo, makeFixtureRoot, removeFixtureRoot, writeFixtureManifest } from './helpers.mjs';
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
      initFixtureRepo(projectPath, 'https://github.com/ChipIn-one/chipin-frontend.git', manifest.projects[0].integrationBranch);
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

  test('fails the standalone CI path for activation when the declared target lacks current routing', () => {
    for (const routing of ['missing', 'malformed', 'stale']) {
      const root = makeFixtureRoot();
      const remoteRoot = makeFixtureRoot();
      try {
        const baseTarget = {
          id: 'syllik/life-ops-bot',
          repository: 'syllik/life-ops-bot',
          localPath: 'personal/life-ops-bot',
          group: 'personal',
          access: 'managed',
          status: 'onboarding',
          integrationBranch: 'master',
          contextPath: '.ai/context.md'
        };
        const baseManifest = fixtureManifest({ projects: [fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow'), baseTarget] });
        const currentTarget = { ...baseTarget, status: 'active' };
        const currentManifest = fixtureManifest({ projects: [fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow'), currentTarget] });
        const { centralPath, manifestPath } = initCentralManifestRepo(root, baseManifest);
        writeFixtureManifest(centralPath, currentManifest);
        mkdirSync(path.join(centralPath, 'projects'), { recursive: true });
        writeFileSync(path.join(centralPath, 'projects/index.md'), renderProjectIndex(currentManifest), 'utf8');
        writeFileSync(path.join(centralPath, 'AGENTS.md'), renderAgentsBlock(currentManifest), 'utf8');

        const remote = path.join(remoteRoot, 'life-ops-bot');
        initFixtureRepo(remote, `https://${currentTarget.repository}.git`, currentTarget.integrationBranch);
        if (routing === 'malformed') {
          writeFileSync(path.join(remote, 'AGENTS.md'), '<!-- ai-workflow:agents-routing:start -->\n', 'utf8');
          git(remote, 'add', 'AGENTS.md');
          git(remote, 'commit', '--quiet', '-m', 'malformed routing');
        } else if (routing === 'stale') {
          writeFileSync(path.join(remote, 'AGENTS.md'), renderManagedBlock('agents-routing', 'stale routing'), 'utf8');
          git(remote, 'add', 'AGENTS.md');
          git(remote, 'commit', '--quiet', '-m', 'stale routing');
        }

        const status = runWorkspaceCli(['check', '--root', centralPath, '--manifest', manifestPath, '--activation-base', 'HEAD'], {
          cloneSource: () => remote,
          expectedRemote: () => remote
        });

        assert.equal(status, 1, routing);
      } finally {
        removeFixtureRoot(remoteRoot);
        removeFixtureRoot(root);
      }
    }
  });

  test('fails standalone activation when current routing exists but declared context is missing', () => {
    const root = makeFixtureRoot();
    const remoteRoot = makeFixtureRoot();
    try {
      const baseTarget = {
        id: 'syllik/life-ops-bot',
        repository: 'syllik/life-ops-bot',
        localPath: 'personal/life-ops-bot',
        group: 'personal',
        access: 'managed',
        status: 'onboarding',
        integrationBranch: 'master',
        contextPath: '.ai/context.md'
      };
      const baseManifest = fixtureManifest({ projects: [fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow'), baseTarget] });
      const currentTarget = { ...baseTarget, status: 'active' };
      const currentManifest = fixtureManifest({ projects: [fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow'), currentTarget] });
      const { centralPath, manifestPath } = initCentralManifestRepo(root, baseManifest);
      writeFixtureManifest(centralPath, currentManifest);
      mkdirSync(path.join(centralPath, 'projects'), { recursive: true });
      writeFileSync(path.join(centralPath, 'projects/index.md'), renderProjectIndex(currentManifest), 'utf8');
      writeFileSync(path.join(centralPath, 'AGENTS.md'), renderAgentsBlock(currentManifest), 'utf8');

      const remote = path.join(remoteRoot, 'life-ops-bot');
      initFixtureRepo(remote, `https://${currentTarget.repository}.git`, currentTarget.integrationBranch);
      writeFileSync(path.join(remote, 'AGENTS.md'), renderAgentsBlock(currentManifest), 'utf8');
      git(remote, 'add', 'AGENTS.md');
      git(remote, 'commit', '--quiet', '-m', 'aligned routing without context');

      const status = runWorkspaceCli(['check', '--root', centralPath, '--manifest', manifestPath, '--activation-base', 'HEAD'], {
        cloneSource: () => remote,
        expectedRemote: () => remote
      });

      assert.equal(status, 1);
    } finally {
      removeFixtureRoot(remoteRoot);
      removeFixtureRoot(root);
    }
  });

  test('accepts standalone activation when the declared integration branch has current routing', () => {
    const root = makeFixtureRoot();
    const remoteRoot = makeFixtureRoot();
    try {
      const baseTarget = {
        id: 'syllik/life-ops-bot',
        repository: 'syllik/life-ops-bot',
        localPath: 'personal/life-ops-bot',
        group: 'personal',
        access: 'managed',
        status: 'onboarding',
        integrationBranch: 'master',
        contextPath: '.ai/context.md'
      };
      const baseManifest = fixtureManifest({ projects: [fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow'), baseTarget] });
      const currentTarget = { ...baseTarget, status: 'active' };
      const currentManifest = fixtureManifest({ projects: [fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow'), currentTarget] });
      const { centralPath, manifestPath } = initCentralManifestRepo(root, baseManifest);
      writeFixtureManifest(centralPath, currentManifest);
      mkdirSync(path.join(centralPath, 'projects'), { recursive: true });
      writeFileSync(path.join(centralPath, 'projects/index.md'), renderProjectIndex(currentManifest), 'utf8');
      writeFileSync(path.join(centralPath, 'AGENTS.md'), renderAgentsBlock(currentManifest), 'utf8');

      const remote = path.join(remoteRoot, 'life-ops-bot');
      initFixtureRepo(remote, `https://${currentTarget.repository}.git`, currentTarget.integrationBranch);
      mkdirSync(path.join(remote, '.ai'), { recursive: true });
      writeFileSync(path.join(remote, currentTarget.contextPath), renderContextScaffold(currentTarget), 'utf8');
      writeFileSync(path.join(remote, '.ai/decisions.md'), '# Decisions\n', 'utf8');
      writeFileSync(path.join(remote, 'AGENTS.md'), renderAgentsBlock(currentManifest), 'utf8');
      git(remote, 'add', '.ai/context.md', '.ai/decisions.md', 'AGENTS.md');
      git(remote, 'commit', '--quiet', '-m', 'aligned routing and context');

      const status = runWorkspaceCli(['check', '--root', centralPath, '--manifest', manifestPath, '--activation-base', 'HEAD'], {
        cloneSource: () => remote,
        expectedRemote: () => remote
      });

      assert.equal(status, 0);
    } finally {
      removeFixtureRoot(remoteRoot);
      removeFixtureRoot(root);
    }
  });

  test('fails standalone CI when an active read-only target becomes managed without current routing', () => {
    for (const routing of ['missing', 'malformed', 'stale']) {
      const root = makeFixtureRoot();
      const remoteRoot = makeFixtureRoot();
      try {
        const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
        const baseTarget = {
          id: 'syllik/life-ops-bot',
          repository: 'syllik/life-ops-bot',
          localPath: 'personal/life-ops-bot',
          group: 'personal',
          access: 'read-only',
          status: 'active',
          integrationBranch: 'master'
        };
        const baseManifest = fixtureManifest({ projects: [central, baseTarget] });
        const currentTarget = { ...baseTarget, access: 'managed', contextPath: '.ai/context.md' };
        const currentManifest = fixtureManifest({ projects: [central, currentTarget] });
        const { centralPath, manifestPath } = initCentralManifestRepo(root, baseManifest);
        writeFixtureManifest(centralPath, currentManifest);
        mkdirSync(path.join(centralPath, 'projects'), { recursive: true });
        writeFileSync(path.join(centralPath, 'projects/index.md'), renderProjectIndex(currentManifest), 'utf8');
        writeFileSync(path.join(centralPath, 'AGENTS.md'), renderAgentsBlock(currentManifest), 'utf8');

        const remote = path.join(remoteRoot, 'life-ops-bot');
        initFixtureRepo(remote, `https://${currentTarget.repository}.git`, currentTarget.integrationBranch);
        if (routing === 'malformed') {
          writeFileSync(path.join(remote, 'AGENTS.md'), '<!-- ai-workflow:agents-routing:start -->\n', 'utf8');
          git(remote, 'add', 'AGENTS.md');
          git(remote, 'commit', '--quiet', '-m', 'malformed routing');
        } else if (routing === 'stale') {
          writeFileSync(path.join(remote, 'AGENTS.md'), renderManagedBlock('agents-routing', 'stale routing'), 'utf8');
          git(remote, 'add', 'AGENTS.md');
          git(remote, 'commit', '--quiet', '-m', 'stale routing');
        }

        const status = runWorkspaceCli(['check', '--root', centralPath, '--manifest', manifestPath, '--activation-base', 'HEAD'], {
          cloneSource: () => remote,
          expectedRemote: () => remote
        });

        assert.equal(status, 1, routing);
      } finally {
        removeFixtureRoot(remoteRoot);
        removeFixtureRoot(root);
      }
    }
  });

  test('fails standalone CI when an active managed target changes to a branch without current routing', () => {
    const root = makeFixtureRoot();
    const remoteRoot = makeFixtureRoot();
    try {
      const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
      const baseTarget = {
        id: 'syllik/life-ops-bot',
        repository: 'syllik/life-ops-bot',
        localPath: 'personal/life-ops-bot',
        group: 'personal',
        access: 'managed',
        status: 'active',
        integrationBranch: 'master',
        contextPath: '.ai/context.md'
      };
      const baseManifest = fixtureManifest({ projects: [central, baseTarget] });
      const currentTarget = { ...baseTarget, integrationBranch: 'develop' };
      const currentManifest = fixtureManifest({ projects: [central, currentTarget] });
      const { centralPath, manifestPath } = initCentralManifestRepo(root, baseManifest);
      writeFixtureManifest(centralPath, currentManifest);
      mkdirSync(path.join(centralPath, 'projects'), { recursive: true });
      writeFileSync(path.join(centralPath, 'projects/index.md'), renderProjectIndex(currentManifest), 'utf8');
      writeFileSync(path.join(centralPath, 'AGENTS.md'), renderAgentsBlock(currentManifest), 'utf8');

      const remote = path.join(remoteRoot, 'life-ops-bot');
      initFixtureRepo(remote, `https://${currentTarget.repository}.git`, baseTarget.integrationBranch);
      git(remote, 'switch', '--create', currentTarget.integrationBranch);

      const status = runWorkspaceCli(['check', '--root', centralPath, '--manifest', manifestPath, '--activation-base', 'HEAD'], {
        cloneSource: () => remote,
        expectedRemote: () => remote
      });

      assert.equal(status, 1);
    } finally {
      removeFixtureRoot(remoteRoot);
      removeFixtureRoot(root);
    }
  });

  test('accepts standalone CI when a changed managed branch has current routing', () => {
    const root = makeFixtureRoot();
    const remoteRoot = makeFixtureRoot();
    try {
      const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
      const baseTarget = {
        id: 'syllik/life-ops-bot',
        repository: 'syllik/life-ops-bot',
        localPath: 'personal/life-ops-bot',
        group: 'personal',
        access: 'managed',
        status: 'active',
        integrationBranch: 'master',
        contextPath: '.ai/context.md'
      };
      const baseManifest = fixtureManifest({ projects: [central, baseTarget] });
      const currentTarget = { ...baseTarget, integrationBranch: 'develop' };
      const currentManifest = fixtureManifest({ projects: [central, currentTarget] });
      const { centralPath, manifestPath } = initCentralManifestRepo(root, baseManifest);
      writeFixtureManifest(centralPath, currentManifest);
      mkdirSync(path.join(centralPath, 'projects'), { recursive: true });
      writeFileSync(path.join(centralPath, 'projects/index.md'), renderProjectIndex(currentManifest), 'utf8');
      writeFileSync(path.join(centralPath, 'AGENTS.md'), renderAgentsBlock(currentManifest), 'utf8');

      const remote = path.join(remoteRoot, 'life-ops-bot');
      initFixtureRepo(remote, `https://${currentTarget.repository}.git`, baseTarget.integrationBranch);
      git(remote, 'switch', '--create', currentTarget.integrationBranch);
      mkdirSync(path.join(remote, '.ai'), { recursive: true });
      writeFileSync(path.join(remote, currentTarget.contextPath), renderContextScaffold(currentTarget), 'utf8');
      writeFileSync(path.join(remote, '.ai/decisions.md'), '# Decisions\n', 'utf8');
      writeFileSync(path.join(remote, 'AGENTS.md'), renderAgentsBlock(currentManifest), 'utf8');
      git(remote, 'add', '.ai/context.md', '.ai/decisions.md', 'AGENTS.md');
      git(remote, 'commit', '--quiet', '-m', 'aligned routing and context on changed branch');

      const status = runWorkspaceCli(['check', '--root', centralPath, '--manifest', manifestPath, '--activation-base', 'HEAD'], {
        cloneSource: () => remote,
        expectedRemote: () => remote
      });

      assert.equal(status, 0);
    } finally {
      removeFixtureRoot(remoteRoot);
      removeFixtureRoot(root);
    }
  });

  test('does not require absent targets for an unchanged standalone checkout', () => {
    const root = makeFixtureRoot();
    try {
      const target = {
        id: 'syllik/life-ops-bot',
        repository: 'syllik/life-ops-bot',
        localPath: 'personal/life-ops-bot',
        group: 'personal',
        access: 'managed',
        status: 'active',
        integrationBranch: 'master',
        contextPath: '.ai/context.md'
      };
      const manifest = fixtureManifest({ projects: [fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow'), target] });
      const { centralPath, manifestPath } = initCentralManifestRepo(root, manifest);

      const status = runWorkspaceCli(['check', '--root', centralPath, '--manifest', manifestPath, '--activation-base', 'HEAD']);

      assert.equal(status, 0);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('does not revalidate unchanged active managed targets when the canonical routing block differs', () => {
    const root = makeFixtureRoot();
    try {
      const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
      const baseTarget = {
        id: 'syllik/life-ops-bot',
        repository: 'syllik/life-ops-bot',
        localPath: 'personal/life-ops-bot',
        group: 'personal',
        access: 'managed',
        status: 'active',
        integrationBranch: 'master',
        contextPath: '.ai/context.md'
      };
      const currentTarget = {
        ...baseTarget,
        contextDependencies: [{ repository: 'syllik/life-ops', integrationBranch: 'master', access: 'read-only' }]
      };
      const baseManifest = fixtureManifest({ projects: [central, baseTarget] });
      const currentManifest = fixtureManifest({ projects: [central, currentTarget] });
      const { centralPath, manifestPath } = initCentralManifestRepo(root, baseManifest);
      writeFixtureManifest(centralPath, currentManifest);
      mkdirSync(path.join(centralPath, 'projects'), { recursive: true });
      writeFileSync(path.join(centralPath, 'projects/index.md'), renderProjectIndex(currentManifest), 'utf8');
      writeFileSync(path.join(centralPath, 'AGENTS.md'), renderAgentsBlock(currentManifest), 'utf8');

      let cloneCount = 0;

      const status = runWorkspaceCli(['check', '--root', centralPath, '--manifest', manifestPath, '--activation-base', 'HEAD'], {
        cloneSource: () => {
          cloneCount += 1;
          throw new Error('unchanged active managed target must not be cloned');
        },
      });

      assert.equal(status, 0);
      assert.equal(cloneCount, 0);
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
      initFixtureRepo(remote, `https://github.com/${project.repository}.git`, project.integrationBranch);
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
      initFixtureRepo(remote, `https://github.com/${project.repository}.git`, project.integrationBranch);
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
