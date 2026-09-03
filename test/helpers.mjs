import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const expectedProjects = [
  { id: 'syllik/syllik', repository: 'syllik/syllik', localPath: 'profile/syllik', group: 'profile', access: 'managed', status: 'onboarding', contextPath: '.ai/context.md' },
  { id: 'ChipIn-one/chipin-frontend', repository: 'ChipIn-one/chipin-frontend', localPath: 'products/chipin/chipin-frontend', group: 'products/chipin', access: 'managed', status: 'onboarding', contextPath: '.ai/context.md' },
  { id: 'ChipIn-one/chipin-backend', repository: 'ChipIn-one/chipin-backend', localPath: 'products/chipin/chipin-backend', group: 'products/chipin', access: 'read-only', status: 'active' },
  { id: 'syllik/chatgpt-archive-cleanup', repository: 'syllik/chatgpt-archive-cleanup', localPath: 'tools/ai/chatgpt-archive-cleanup', group: 'tools/ai', access: 'managed', status: 'onboarding', contextPath: '.ai/context.md' },
  { id: 'syllik/codex-local-runner', repository: 'syllik/codex-local-runner', localPath: 'tools/ai/codex-local-runner', group: 'tools/ai', access: 'managed', status: 'onboarding', contextPath: '.ai/context.md' },
  { id: 'syllik/youtube-metadata-translator', repository: 'syllik/youtube-metadata-translator', localPath: 'tools/content/youtube-metadata-translator', group: 'tools/content', access: 'managed', status: 'onboarding', contextPath: '.ai/context.md' },
  { id: 'syllik/ai-workflow', repository: 'syllik/ai-workflow', localPath: 'workflows/ai/ai-workflow', group: 'workflows/ai', access: 'managed', status: 'active', contextPath: '.ai/context.md' },
  { id: 'syllik/gpg-signed-commits', repository: 'syllik/gpg-signed-commits', localPath: 'guides/git/gpg-signed-commits', group: 'guides/git', access: 'managed', status: 'onboarding', contextPath: '.ai/context.md' }
];

export const fixtureBudgets = {
  'AI.md': 1024,
  'FLOW.md': 2048,
  'global role file': 6144,
  'managed AGENTS block': 1024,
  '.ai/context.md': 8192,
  'one decision record': 4096,
  'prompt.md': 8192,
  'state.md': 2048,
  'result.md': 4096,
  'human plan.md': 16384
};

export function fixtureManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    canonicalRoot: '~/Desktop/WORK',
    budgets: { ...fixtureBudgets },
    projects: expectedProjects.map((project) => ({ ...project })),
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

export function initFixtureRepo(directory, remote = 'https://github.com/example/project.git') {
  mkdirSync(directory, { recursive: true });
  execFileSync('git', ['init', '--quiet', directory]);
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
