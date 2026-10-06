import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderAgentsBlock, renderContextScaffold, renderProjectIndex } from '../scripts/workspace/render.mjs';
import { CANONICAL_EXECUTION_POLICY } from '../scripts/workspace/task-policy.mjs';

export const expectedProjects = [
  { id: 'syllik/syllik', repository: 'syllik/syllik', localPath: 'profile/syllik', group: 'profile', access: 'managed', status: 'active', integrationBranch: 'master', contextPath: '.ai/context.md' },
  { id: 'ChipIn-one/chipin-frontend', repository: 'ChipIn-one/chipin-frontend', localPath: 'products/chipin/chipin-frontend', group: 'products/chipin', access: 'managed', status: 'active', integrationBranch: 'dev', contextPath: '.ai/context.md' },
  { id: 'ChipIn-one/chipin-backend', repository: 'ChipIn-one/chipin-backend', localPath: 'products/chipin/chipin-backend', group: 'products/chipin', access: 'read-only', status: 'active', integrationBranch: 'develop' },
  { id: 'syllik/chatgpt-archive-cleanup', repository: 'syllik/chatgpt-archive-cleanup', localPath: 'tools/ai/chatgpt-archive-cleanup', group: 'tools/ai', access: 'managed', status: 'active', integrationBranch: 'main', contextPath: '.ai/context.md' },
  { id: 'syllik/codex-local-runner', repository: 'syllik/codex-local-runner', localPath: 'tools/ai/codex-local-runner', group: 'tools/ai', access: 'managed', status: 'onboarding', integrationBranch: 'master', contextPath: '.ai/context.md' },
  { id: 'syllik/youtube-metadata-translator', repository: 'syllik/youtube-metadata-translator', localPath: 'tools/content/youtube-metadata-translator', group: 'tools/content', access: 'managed', status: 'active', integrationBranch: 'main', contextPath: '.ai/context.md' },
  { id: 'syllik/ai-workflow', repository: 'syllik/ai-workflow', localPath: 'workflows/ai/ai-workflow', group: 'workflows/ai', access: 'managed', status: 'active', integrationBranch: 'master', contextPath: '.ai/context.md' },
  { id: 'syllik/gpg-signed-commits', repository: 'syllik/gpg-signed-commits', localPath: 'guides/git/gpg-signed-commits', group: 'guides/git', access: 'managed', status: 'active', integrationBranch: 'main', contextPath: '.ai/context.md' }
];

export const fixtureGitLifecycle = {
  canonicalBranch: 'master',
  normalMergeMethod: 'squash',
  productionPromotion: 'exact-commit',
  temporaryIssueBranchPattern: '<type>/issue-<number>-<slug>',
  repositories: [
    { repository: 'syllik/syllik', deploymentProfile: 'none', branchState: 'canonical', defaultBranch: 'master', integrationBranch: 'master' },
    {
      repository: 'ChipIn-one/chipin-frontend',
      deploymentProfile: 'production',
      branchState: 'temporary-exception',
      defaultBranch: 'main',
      integrationBranch: 'dev',
      promotionBranch: 'main',
      exception: {
        reason: 'Preserve dev-to-main ancestry promotion until exact-commit promotion replaces it.',
        followUp: 'Replace promotion, then migrate to master.'
      }
    },
    { repository: 'ChipIn-one/chipin-backend', deploymentProfile: 'production', branchState: 'migration', defaultBranch: 'develop', integrationBranch: 'develop' },
    { repository: 'syllik/ai-workflow', deploymentProfile: 'none', branchState: 'canonical', defaultBranch: 'master', integrationBranch: 'master' }
  ]
};

export const fixtureBudgets = {
  'AI.md': 1024,
  'FLOW.md': 2048,
  'global role file': 6144,
  'managed AGENTS block': 1024,
  '.ai/context.md': 8192,
  'one decision record': 4096,
  'prompt.md': 8192,
  'state.md': 2048,
  'assembled execution context': 32768,
  'result.md': 4096,
  'human plan.md': 16384
};

export function fixtureManifest(overrides = {}) {
  const projects = overrides.projects ?? expectedProjects.map((project) => ({ ...project }));
  const lifecycleRepositories = fixtureGitLifecycle.repositories
    .filter((entry) => projects.some((project) => project.repository.toLowerCase() === entry.repository.toLowerCase()))
    .map((entry) => ({
      ...entry,
      ...(entry.exception ? { exception: { ...entry.exception } } : {})
    }));
  return {
    schemaVersion: 2,
    canonicalRoot: '~/Desktop/WORK',
    budgets: { ...fixtureBudgets },
    executionPolicy: overrides.executionPolicy ?? structuredClone(CANONICAL_EXECUTION_POLICY),
    gitLifecycle: overrides.gitLifecycle ?? {
      ...fixtureGitLifecycle,
      repositories: lifecycleRepositories
    },
    projects,
    ...overrides
  };
}

export function makeFixtureRoot() {
  return mkdtempSync(path.join(os.tmpdir(), 'ai-workflow-workspace-'));
}

export function removeFixtureRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

export function writeFixtureManifest(root, manifest = fixtureManifest()) {
  writeFileSync(path.join(root, 'workspace.yaml'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return path.join(root, 'workspace.yaml');
}

export function initFixtureRepo(directory, remote = 'https://github.com/example/project.git', branch = 'master') {
  mkdirSync(directory, { recursive: true });
  execFileSync('git', ['init', '--quiet', '--initial-branch', branch, directory]);
  execFileSync('git', ['-C', directory, 'config', 'user.email', 'fixture@example.test']);
  execFileSync('git', ['-C', directory, 'config', 'user.name', 'Fixture']);
  execFileSync('git', ['-C', directory, 'config', 'commit.gpgsign', 'false']);
  writeFileSync(path.join(directory, '.keep'), 'fixture\n', 'utf8');
  execFileSync('git', ['-C', directory, 'add', '.keep']);
  execFileSync('git', ['-C', directory, 'commit', '--quiet', '-m', 'fixture']);
  execFileSync('git', ['-C', directory, 'remote', 'add', 'origin', remote]);
}

export function git(directory, ...args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
}

export function initCentralManifestRepo(root, manifest, { indexManifest = manifest, includeIndex = true } = {}) {
  const central = manifest.projects.find(({ repository }) => repository === 'syllik/ai-workflow');
  const centralPath = path.join(root, central.localPath);
  initFixtureRepo(centralPath, 'https://github.com/syllik/ai-workflow.git', central.integrationBranch);
  mkdirSync(path.join(centralPath, '.ai'), { recursive: true });
  writeFileSync(path.join(centralPath, 'AGENTS.md'), renderAgentsBlock(manifest), 'utf8');
  writeFileSync(path.join(centralPath, central.contextPath), renderContextScaffold(central), 'utf8');
  writeFileSync(path.join(centralPath, '.ai/decisions.md'), '# Decisions\n', 'utf8');
  if (includeIndex) {
    mkdirSync(path.join(centralPath, 'projects'), { recursive: true });
    writeFileSync(path.join(centralPath, 'projects/index.md'), renderProjectIndex(indexManifest), 'utf8');
  }
  const manifestPath = writeFixtureManifest(centralPath, manifest);
  git(centralPath, 'add', '.');
  git(centralPath, 'commit', '--quiet', '-m', 'committed manifest change');
  return { central, centralPath, manifestPath };
}
