import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { applyOperations, checkGeneratedFiles, planWorkspace } from '../scripts/workspace/operations.mjs';
import { renderAgentsBlock, renderContextScaffold, renderManagedBlock, renderProjectIndex } from '../scripts/workspace/render.mjs';
import { fixtureManifest, git, initFixtureRepo, makeFixtureRoot, removeFixtureRoot, writeFixtureManifest } from './helpers.mjs';

describe('workspace operations', () => {
  test('defaults direct workspace options to the checkout manifest, not the target root', () => {
    const root = makeFixtureRoot();
    try {
      const result = planWorkspace({ root });
      assert.equal(result.manifestPath, path.resolve('workspace.yaml'));
      assert.equal(result.validationFailed, false);
    } finally {
      removeFixtureRoot(root);
    }
  });

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

  test('plans and applies managed contracts inside each repository at its local path', () => {
    const root = makeFixtureRoot();
    try {
      const manifest = fixtureManifest({
        projects: [
          fixtureManifest().projects[1],
          fixtureManifest().projects[3]
        ]
      });
      const frontendPath = path.join(root, manifest.projects[0].localPath);
      const archivePath = path.join(root, manifest.projects[1].localPath);
      initFixtureRepo(frontendPath, 'https://github.com/ChipIn-one/chipin-frontend.git');
      initFixtureRepo(archivePath, 'https://github.com/syllik/chatgpt-archive-cleanup.git');

      writeFileSync(path.join(frontendPath, 'AGENTS.md'), `Repository rules\n${renderManagedBlock('agents-routing', 'old routing')}\n`, 'utf8');
      mkdirSync(path.join(frontendPath, '.ai'), { recursive: true });
      writeFileSync(path.join(frontendPath, '.ai/decisions.md'), 'Existing decisions\n', 'utf8');
      git(frontendPath, 'add', 'AGENTS.md', '.ai/decisions.md');
      git(frontendPath, 'commit', '--quiet', '-m', 'existing contract content');

      const manifestPath = writeFixtureManifest(root, manifest);
      const plan = planWorkspace({ root, manifestPath, manifest });
      const operationPaths = plan.operations.map((operation) => operation.path);

      assert.equal(operationPaths.includes('AGENTS.md'), false);
      assert.equal(operationPaths.includes('projects/index.md'), false);
      assert.equal(operationPaths.includes('products/chipin/chipin-frontend/AGENTS.md'), true);
      assert.equal(operationPaths.includes('products/chipin/chipin-frontend/.ai/context.md'), true);
      assert.equal(operationPaths.includes('products/chipin/chipin-frontend/.ai/decisions.md'), false);
      assert.equal(operationPaths.includes('tools/ai/chatgpt-archive-cleanup/AGENTS.md'), true);
      assert.equal(operationPaths.includes('tools/ai/chatgpt-archive-cleanup/.ai/context.md'), true);
      assert.equal(operationPaths.includes('tools/ai/chatgpt-archive-cleanup/.ai/decisions.md'), true);

      const applied = applyOperations({ root, plan });
      assert.equal(applied.blocked, false);
      assert.equal(readFileSync(path.join(frontendPath, 'AGENTS.md'), 'utf8'), `Repository rules\n${renderAgentsBlock(manifest)}`);
      assert.equal(readFileSync(path.join(frontendPath, '.ai/decisions.md'), 'utf8'), 'Existing decisions\n');
      assert.equal(readFileSync(path.join(archivePath, 'AGENTS.md'), 'utf8'), renderAgentsBlock(manifest));
      assert.equal(readFileSync(path.join(archivePath, '.ai/decisions.md'), 'utf8'), '# Decisions\n\nRecord durable decisions for this repository here.\n');
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('plans only a clone when an allowlisted read-only repository is missing', () => {
    const root = makeFixtureRoot();
    try {
      const manifest = fixtureManifest({ projects: [fixtureManifest().projects[2]] });
      const result = planWorkspace({ root, manifestPath: writeFixtureManifest(root, manifest), manifest });
      assert.deepEqual(result.operations.map(({ kind, repository, path: operationPath }) => ({ kind, repository, path: operationPath })), [{
        kind: 'clone',
        repository: 'ChipIn-one/chipin-backend',
        path: 'products/chipin/chipin-backend'
      }]);
      assert.equal(result.operations.some((operation) => operation.path.startsWith('products/chipin/chipin-backend/')), false);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('plans no operations for a present read-only repository', () => {
    const root = makeFixtureRoot();
    try {
      const manifest = fixtureManifest({ projects: [fixtureManifest().projects[2]] });
      initFixtureRepo(path.join(root, 'products/chipin/chipin-backend'), 'https://github.com/ChipIn-one/chipin-backend.git');
      mkdirSync(path.join(root, 'projects'), { recursive: true });
      writeFileSync(path.join(root, 'projects/index.md'), renderProjectIndex(manifest), 'utf8');
      const result = planWorkspace({ root, manifestPath: writeFixtureManifest(root, manifest), manifest });
      assert.deepEqual(result.operations, []);
      assert.equal(result.operations.some((operation) => operation.path.includes('ChipIn-one/chipin-backend')), false);
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

  test('preserves populated managed context while still blocking malformed or duplicate marker blocks', () => {
    const root = makeFixtureRoot();
    try {
      const target = path.join(root, 'workflows/ai/ai-workflow');
      initFixtureRepo(target, 'https://github.com/syllik/ai-workflow.git');
      mkdirSync(path.join(target, '.ai'), { recursive: true });
      writeFileSync(path.join(target, '.ai/context.md'), 'existing context\n', 'utf8');
      git(target, 'add', '.ai/context.md');
      git(target, 'commit', '--quiet', '-m', 'context');
      writeFileSync(path.join(target, 'AGENTS.md'), '<!-- ai-workflow:agents-routing:start -->\nfirst\n<!-- ai-workflow:agents-routing:start -->\n', 'utf8');
      git(target, 'add', 'AGENTS.md');
      git(target, 'commit', '--quiet', '-m', 'malformed routing block');
      const result = planWorkspace({ root, manifestPath: writeFixtureManifest(root), manifest: fixtureManifest() });
      assert.equal(result.findings.some(({ code }) => code === 'POPULATED_CONTEXT'), false);
      assert.equal(result.findings.some(({ code }) => code === 'DUPLICATE_MARKER'), true);
      assert.equal(result.blocked, true);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('accepts and preserves a non-generated context through apply and the next plan', () => {
    const root = makeFixtureRoot();
    try {
      const project = fixtureManifest().projects[0];
      const manifest = fixtureManifest({ projects: [project] });
      const repositoryPath = path.join(root, project.localPath);
      initFixtureRepo(repositoryPath, `https://github.com/${project.repository}.git`);
      mkdirSync(path.join(repositoryPath, '.ai'), { recursive: true });
      const context = '# Project\n\n## Repository\nsyllik/syllik\n\n## Purpose\nDurable project facts.\n';
      writeFileSync(path.join(repositoryPath, project.contextPath), context, 'utf8');
      writeFileSync(path.join(repositoryPath, '.ai/decisions.md'), '# Decisions\n\nRecord durable decisions for this repository here.\n', 'utf8');
      writeFileSync(path.join(repositoryPath, 'AGENTS.md'), renderAgentsBlock(manifest), 'utf8');
      git(repositoryPath, 'add', 'AGENTS.md', '.ai');
      git(repositoryPath, 'commit', '--quiet', '-m', 'existing project contract');

      const manifestPath = writeFixtureManifest(root, manifest);
      mkdirSync(path.join(root, 'projects'), { recursive: true });
      writeFileSync(path.join(root, 'projects/index.md'), renderProjectIndex(manifest), 'utf8');
      const plan = planWorkspace({ root, manifestPath, manifest });

      assert.equal(plan.findings.some(({ code }) => code === 'POPULATED_CONTEXT'), false);
      assert.equal(plan.operations.some(({ path: operationPath }) => operationPath === `${project.localPath}/${project.contextPath}`), false);
      assert.equal(plan.blocked, false);
      const applied = applyOperations({ root, plan });
      assert.equal(applied.blocked, false);
      assert.equal(readFileSync(path.join(repositoryPath, project.contextPath), 'utf8'), context);
      assert.deepEqual(checkGeneratedFiles(root, manifest, manifestPath), []);
      assert.deepEqual(planWorkspace({ root, manifestPath, manifest }).operations, []);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('blocks an oversized existing context by UTF-8 bytes without reporting populated drift', () => {
    const root = makeFixtureRoot();
    try {
      const project = fixtureManifest().projects[0];
      const manifest = fixtureManifest({ projects: [project] });
      const repositoryPath = path.join(root, project.localPath);
      initFixtureRepo(repositoryPath, `https://github.com/${project.repository}.git`);
      mkdirSync(path.join(repositoryPath, '.ai'), { recursive: true });
      writeFileSync(path.join(repositoryPath, project.contextPath), `# Project\n${'🙂'.repeat(2048)}\n`, 'utf8');
      git(repositoryPath, 'add', '.ai/context.md');
      git(repositoryPath, 'commit', '--quiet', '-m', 'oversized context');
      const plan = planWorkspace({ root, manifestPath: writeFixtureManifest(root, manifest), manifest });

      assert.equal(plan.findings.some(({ code }) => code === 'POPULATED_CONTEXT'), false);
      assert.equal(plan.findings.some(({ code, path: findingPath }) => code === 'BUDGET_EXCEEDED' && findingPath === `${project.localPath}/${project.contextPath}`), true);
      assert.equal(plan.blocked, true);
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
          writeFileSync(path.join(projectPath, project.contextPath), renderContextScaffold(project), 'utf8');
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

  test('does not reject an isolated apply root merely because it is the plan canonical root', () => {
    const root = makeFixtureRoot();
    try {
      const result = applyOperations({ root, plan: { root, manifest: { canonicalRoot: root }, operations: [], fingerprints: {} } });
      assert.equal(result.blocked, false);
      assert.deepEqual(result.findings, []);
    } finally {
      removeFixtureRoot(root);
    }
  });
});
