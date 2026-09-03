import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { applyOperations, planWorkspace } from '../scripts/workspace/operations.mjs';
import { renderManagedContextBlock } from '../scripts/workspace/render.mjs';
import { fixtureManifest, git, initFixtureRepo, makeFixtureRoot, removeFixtureRoot, writeFixtureManifest } from './helpers.mjs';

describe('workspace operations', () => {
  test('plans a clone only for a missing managed project', () => {
    const root = makeFixtureRoot();
    try {
      const manifestPath = writeFixtureManifest(root);
      const result = planWorkspace({ root, manifestPath, manifest: fixtureManifest() });
      const clone = result.operations.find((operation) => operation.kind === 'clone' && operation.path === 'profile/syllik');
      assert.deepEqual(clone, {
        kind: 'clone',
        repository: 'syllik/syllik',
        path: 'profile/syllik',
        destination: path.join(root, 'profile/syllik')
      });
      assert.equal(result.blocked, false);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('does not clone an existing repository with the expected origin', () => {
    const root = makeFixtureRoot();
    try {
      const projectPath = path.join(root, 'profile/syllik');
      initFixtureRepo(projectPath, 'https://github.com/syllik/syllik.git');
      const manifest = fixtureManifest();
      const result = planWorkspace({ root, manifestPath: writeFixtureManifest(root, manifest), manifest });
      assert.equal(result.operations.some((operation) => operation.kind === 'clone' && operation.path === 'profile/syllik'), false);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('blocks wrong origins, collisions, dirty repositories, and read-only writes', () => {
    const root = makeFixtureRoot();
    try {
      const wrong = path.join(root, 'profile/syllik');
      initFixtureRepo(wrong, 'https://github.com/other/repository.git');
      const collision = path.join(root, 'tools/ai/chatgpt-archive-cleanup');
      mkdirSync(collision, { recursive: true });
      writeFileSync(path.join(collision, 'occupied.txt'), 'occupied\n');
      const dirty = path.join(root, 'tools/ai/codex-local-runner');
      initFixtureRepo(dirty, 'https://github.com/syllik/codex-local-runner.git');
      writeFileSync(path.join(dirty, 'dirty.txt'), 'dirty\n');
      const backend = path.join(root, 'products/chipin/chipin-backend');
      initFixtureRepo(backend, 'https://github.com/ChipIn-one/chipin-backend.git');
      const result = planWorkspace({ root, manifestPath: writeFixtureManifest(root), manifest: fixtureManifest() });
      const codes = new Set(result.findings.map(({ code }) => code));
      assert.equal(codes.has('ORIGIN_MISMATCH'), true);
      assert.equal(codes.has('DESTINATION_COLLISION'), true);
      assert.equal(codes.has('DIRTY_REPOSITORY'), true);
      assert.equal(result.operations.some((operation) => operation.path === 'products/chipin/chipin-backend'), false);
      assert.equal(result.blocked, true);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('blocks populated managed context and malformed or duplicate marker blocks', () => {
    const root = makeFixtureRoot();
    try {
      const target = path.join(root, 'workflows/ai/ai-workflow');
      initFixtureRepo(target, 'https://github.com/syllik/ai-workflow.git');
      mkdirSync(path.join(target, '.ai'), { recursive: true });
      writeFileSync(path.join(target, '.ai/context.md'), 'existing context\n', 'utf8');
      git(target, 'add', '.ai/context.md');
      git(target, 'commit', '--quiet', '-m', 'context');
      writeFileSync(path.join(root, 'AGENTS.md'), '<!-- ai-workflow:agents-routing:start -->\nfirst\n<!-- ai-workflow:agents-routing:start -->\n', 'utf8');
      const result = planWorkspace({ root, manifestPath: writeFixtureManifest(root), manifest: fixtureManifest() });
      assert.equal(result.findings.some(({ code }) => code === 'POPULATED_CONTEXT'), true);
      assert.equal(result.findings.some(({ code }) => code === 'DUPLICATE_MARKER'), true);
      assert.equal(result.blocked, true);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('apply is idempotent in an isolated fixture and refuses first drift', () => {
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
      const plan = planWorkspace({ root, manifestPath, manifest });
      assert.equal(plan.blocked, false);
      const first = applyOperations({ root, plan });
      assert.equal(first.blocked, false);
      const secondPlan = planWorkspace({ root, manifestPath, manifest });
      assert.equal(secondPlan.operations.length, 0);
      writeFileSync(path.join(root, 'AGENTS.md'), 'drift\n', 'utf8');
      const applied = applyOperations({ root, plan });
      assert.equal(applied.blocked, true);
      assert.equal(applied.findings.some(({ code }) => code === 'FIRST_DRIFT'), true);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('blocks an operation whose destination escapes the workspace root', () => {
    const root = makeFixtureRoot();
    try {
      const manifest = fixtureManifest();
      manifest.projects[0].localPath = '../escape';
      const result = planWorkspace({ root, manifestPath: writeFixtureManifest(root, manifest), manifest });
      assert.equal(result.findings.some(({ code }) => code === 'UNSAFE_PATH'), true);
      assert.equal(result.validationFailed, true);
      assert.equal(result.blocked, false);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('refuses canonical workspace apply even when the plan has no manifest', () => {
    const root = path.resolve(os.homedir(), 'Desktop/WORK');
    const result = applyOperations({ root, plan: { root, operations: [], fingerprints: {} } });
    assert.equal(result.blocked, true);
    assert.equal(result.findings.some(({ code }) => code === 'CANONICAL_APPLY_FORBIDDEN'), true);
  });
});
