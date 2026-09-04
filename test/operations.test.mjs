import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { applyOperations, checkGeneratedFiles, planWorkspace } from '../scripts/workspace/operations.mjs';
import { run as runWorkspaceCli } from '../scripts/workspace/cli.mjs';
import { renderAgentsBlock, renderContextScaffold, renderManagedBlock, renderProjectIndex } from '../scripts/workspace/render.mjs';
import { fixtureManifest, git, initCentralManifestRepo, initFixtureRepo, makeFixtureRoot, removeFixtureRoot, writeFixtureManifest } from './helpers.mjs';

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

  test('plans a central generated index replacement alongside a new project clone', () => {
    const root = makeFixtureRoot();
    const remoteRoot = makeFixtureRoot();
    try {
      const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
      const newProject = {
        id: 'syllik/new-approved-repository',
        repository: 'syllik/new-approved-repository',
        localPath: 'tools/new-approved-repository',
        group: 'tools',
        access: 'managed',
        status: 'onboarding',
        contextPath: '.ai/context.md'
      };
      const manifest = fixtureManifest({ projects: [central, newProject] });
      const centralPath = path.join(root, central.localPath);
      initFixtureRepo(centralPath, 'https://github.com/syllik/ai-workflow.git');
      mkdirSync(path.join(centralPath, '.ai'), { recursive: true });
      mkdirSync(path.join(centralPath, 'projects'), { recursive: true });
      writeFileSync(path.join(centralPath, 'AGENTS.md'), renderAgentsBlock(manifest), 'utf8');
      writeFileSync(path.join(centralPath, central.contextPath), renderContextScaffold(central), 'utf8');
      writeFileSync(path.join(centralPath, '.ai/decisions.md'), '# Decisions\n', 'utf8');
      writeFileSync(path.join(centralPath, 'projects/index.md'), renderProjectIndex({ ...manifest, projects: [central] }), 'utf8');
      const manifestPath = writeFixtureManifest(centralPath, manifest);
      git(centralPath, 'add', '.');
      git(centralPath, 'commit', '--quiet', '-m', 'committed manifest change');

      const source = path.join(remoteRoot, 'new-approved-repository');
      initFixtureRepo(source, 'https://github.com/syllik/new-approved-repository.git');
      const plan = planWorkspace({
        root,
        manifestPath,
        manifest,
        cloneSource: { 'syllik/new-approved-repository': source }
      });

      const indexOperation = plan.operations.find(({ path: operationPath }) => operationPath === `${central.localPath}/projects/index.md`);
      assert.equal(indexOperation?.kind, 'replace-generated-file');
      assert.equal(indexOperation?.content, renderProjectIndex(manifest));
      assert.equal(plan.operations.some(({ kind, path: operationPath }) => kind === 'clone' && operationPath === newProject.localPath), true);
      assert.equal(plan.blocked, false);
    } finally {
      removeFixtureRoot(remoteRoot);
      removeFixtureRoot(root);
    }
  });

  test('one apply writes the exact central index and a second plan is clean', () => {
    const root = makeFixtureRoot();
    try {
      const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
      const project = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/syllik');
      const manifest = fixtureManifest({ projects: [central, project] });
      const { manifestPath, centralPath } = initCentralManifestRepo(root, manifest, { indexManifest: { ...manifest, projects: [central] } });
      const projectPath = path.join(root, project.localPath);
      initFixtureRepo(projectPath, `https://github.com/${project.repository}.git`);
      mkdirSync(path.join(projectPath, '.ai'), { recursive: true });
      writeFileSync(path.join(projectPath, 'AGENTS.md'), renderAgentsBlock(manifest), 'utf8');
      writeFileSync(path.join(projectPath, project.contextPath), renderContextScaffold(project), 'utf8');
      writeFileSync(path.join(projectPath, '.ai/decisions.md'), '# Decisions\n', 'utf8');
      git(projectPath, 'add', '.');
      git(projectPath, 'commit', '--quiet', '-m', 'existing project contracts');

      const plan = planWorkspace({ root, manifestPath, manifest });
      assert.deepEqual(plan.operations.map(({ kind, path: operationPath }) => ({ kind, path: operationPath })), [{
        kind: 'replace-generated-file',
        path: `${central.localPath}/projects/index.md`
      }]);
      const applied = applyOperations({ root, plan });

      assert.equal(applied.blocked, false);
      assert.equal(readFileSync(path.join(centralPath, 'projects/index.md'), 'utf8'), renderProjectIndex(manifest));
      assert.deepEqual(checkGeneratedFiles(root, manifest, manifestPath), []);
      const secondPlan = planWorkspace({ root, manifestPath, manifest, generatedOutputs: applied.generatedOutputs });
      assert.deepEqual(secondPlan.operations, []);
      assert.deepEqual(secondPlan.findings, []);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('one apply safely creates a missing central index and converges', () => {
    const root = makeFixtureRoot();
    try {
      const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
      const manifest = fixtureManifest({ projects: [central] });
      const { manifestPath, centralPath } = initCentralManifestRepo(root, manifest, { includeIndex: false });

      const plan = planWorkspace({ root, manifestPath, manifest });
      assert.equal(plan.operations[0]?.kind, 'replace-generated-file');
      assert.equal(plan.operations[0]?.expectedFingerprint, null);
      const applied = applyOperations({ root, plan });

      assert.equal(applied.blocked, false);
      assert.equal(readFileSync(path.join(centralPath, 'projects/index.md'), 'utf8'), renderProjectIndex(manifest));
      assert.deepEqual(checkGeneratedFiles(root, manifest, manifestPath), []);
      const secondPlan = planWorkspace({ root, manifestPath, manifest, generatedOutputs: applied.generatedOutputs });
      assert.deepEqual(secondPlan.operations, []);
      assert.deepEqual(secondPlan.findings, []);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('stale central index between plan and apply blocks before cloning a project', () => {
    const root = makeFixtureRoot();
    try {
      const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
      const project = {
        id: 'syllik/new-approved-repository',
        repository: 'syllik/new-approved-repository',
        localPath: 'tools/new-approved-repository',
        group: 'tools',
        access: 'managed',
        status: 'onboarding',
        contextPath: '.ai/context.md'
      };
      const manifest = fixtureManifest({ projects: [central, project] });
      const { manifestPath, centralPath } = initCentralManifestRepo(root, manifest, { indexManifest: { ...manifest, projects: [central] } });
      const indexPath = path.join(centralPath, 'projects/index.md');
      const plan = planWorkspace({ root, manifestPath, manifest, cloneSource: { [project.repository]: root } });
      writeFileSync(indexPath, 'changed after plan\n', 'utf8');

      const applied = applyOperations({ root, plan });

      assert.equal(applied.blocked, true);
      assert.deepEqual(applied.applied, []);
      assert.equal(applied.findings.some(({ code }) => code === 'FIRST_DRIFT'), true);
      assert.equal(existsSync(path.join(root, project.localPath)), false);
      assert.equal(readFileSync(indexPath, 'utf8'), 'changed after plan\n');
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('forged generated destination or content cannot overwrite a file', () => {
    for (const forge of ['destination', 'content']) {
      const root = makeFixtureRoot();
      try {
        const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
        const manifest = fixtureManifest({ projects: [central] });
        const { manifestPath, centralPath } = initCentralManifestRepo(root, manifest, { indexManifest: { ...manifest, projects: [] } });
        const indexPath = path.join(centralPath, 'projects/index.md');
        const forgedPath = path.join(root, 'forged.txt');
        writeFileSync(forgedPath, 'sentinel\n', 'utf8');
        const plan = planWorkspace({ root, manifestPath, manifest });
        const operation = plan.operations[0];
        const forgedOperation = forge === 'destination'
          ? { ...operation, destination: forgedPath }
          : { ...operation, content: 'forged content\n' };

        const applied = applyOperations({ root, plan: { ...plan, operations: [forgedOperation] } });

        assert.equal(applied.blocked, true, forge);
        assert.deepEqual(applied.applied, [], forge);
        assert.equal(readFileSync(indexPath, 'utf8'), renderProjectIndex({ ...manifest, projects: [] }), forge);
        assert.equal(readFileSync(forgedPath, 'utf8'), 'sentinel\n', forge);
      } finally {
        removeFixtureRoot(root);
      }
    }
  });

  test('blocks a dirty central checkout before any new project is cloned', () => {
    const root = makeFixtureRoot();
    try {
      const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
      const project = { ...fixtureManifest().projects[0], id: 'syllik/new-approved-repository', repository: 'syllik/new-approved-repository', localPath: 'tools/new-approved-repository', group: 'tools' };
      const manifest = fixtureManifest({ projects: [central, project] });
      const { manifestPath, centralPath } = initCentralManifestRepo(root, manifest, { indexManifest: { ...manifest, projects: [central] } });
      writeFileSync(path.join(centralPath, 'uncommitted.txt'), 'uncommitted\n', 'utf8');
      const plan = planWorkspace({ root, manifestPath, manifest, cloneSource: { [project.repository]: root } });

      const applied = applyOperations({ root, plan });

      assert.equal(plan.blocked, true);
      assert.equal(plan.findings.some(({ code }) => code === 'CENTRAL_REPOSITORY_UNVERIFIED'), true);
      assert.equal(applied.blocked, true);
      assert.deepEqual(applied.applied, []);
      assert.equal(existsSync(path.join(root, project.localPath)), false);
      assert.equal(readFileSync(path.join(centralPath, 'uncommitted.txt'), 'utf8'), 'uncommitted\n');
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('blocks a wrong central origin before any generated write', () => {
    const root = makeFixtureRoot();
    try {
      const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
      const manifest = fixtureManifest({ projects: [central] });
      const { manifestPath, centralPath } = initCentralManifestRepo(root, manifest, { indexManifest: { ...manifest, projects: [] } });
      const indexPath = path.join(centralPath, 'projects/index.md');
      git(centralPath, 'remote', 'set-url', 'origin', 'https://github.com/other/repository.git');

      const plan = planWorkspace({ root, manifestPath, manifest });
      const applied = applyOperations({ root, plan });

      assert.equal(plan.blocked, true);
      assert.equal(plan.findings.some(({ code }) => code === 'ORIGIN_MISMATCH'), true);
      assert.equal(plan.findings.some(({ code }) => code === 'CENTRAL_REPOSITORY_UNVERIFIED'), true);
      assert.equal(applied.blocked, true);
      assert.deepEqual(applied.applied, []);
      assert.equal(readFileSync(indexPath, 'utf8'), renderProjectIndex({ ...manifest, projects: [] }));
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('blocks a central manifest path mapping that does not match the manifest checkout', () => {
    const root = makeFixtureRoot();
    try {
      const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
      const manifest = fixtureManifest({ projects: [{ ...central, localPath: 'workflows/wrong/ai-workflow' }] });
      const actualCentralPath = path.join(root, central.localPath);
      initFixtureRepo(actualCentralPath, 'https://github.com/syllik/ai-workflow.git');
      mkdirSync(path.join(actualCentralPath, '.ai'), { recursive: true });
      mkdirSync(path.join(actualCentralPath, 'projects'), { recursive: true });
      writeFileSync(path.join(actualCentralPath, 'AGENTS.md'), renderAgentsBlock(manifest), 'utf8');
      writeFileSync(path.join(actualCentralPath, central.contextPath), renderContextScaffold(central), 'utf8');
      writeFileSync(path.join(actualCentralPath, '.ai/decisions.md'), '# Decisions\n', 'utf8');
      writeFileSync(path.join(actualCentralPath, 'projects/index.md'), renderProjectIndex({ ...manifest, projects: [] }), 'utf8');
      const manifestPath = writeFixtureManifest(actualCentralPath, manifest);
      git(actualCentralPath, 'add', '.');
      git(actualCentralPath, 'commit', '--quiet', '-m', 'committed manifest change');

      const plan = planWorkspace({ root, manifestPath, manifest });
      const applied = applyOperations({ root, plan });

      assert.equal(plan.blocked, true);
      assert.equal(plan.findings.some(({ code }) => code === 'CENTRAL_REPOSITORY_UNVERIFIED'), true);
      assert.equal(applied.blocked, true);
      assert.deepEqual(applied.applied, []);
      assert.equal(readFileSync(path.join(actualCentralPath, 'projects/index.md'), 'utf8'), renderProjectIndex({ ...manifest, projects: [] }));
      assert.equal(existsSync(path.join(root, 'workflows/wrong/ai-workflow')), false);
    } finally {
      removeFixtureRoot(root);
    }
  });

  test('blocks a manifest checkout outside the declared workspace root', () => {
    const root = makeFixtureRoot();
    const outside = makeFixtureRoot();
    try {
      const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
      const manifest = fixtureManifest({ projects: [central] });
      const { manifestPath, centralPath } = initCentralManifestRepo(outside, manifest, { indexManifest: { ...manifest, projects: [] } });
      const indexPath = path.join(centralPath, 'projects/index.md');

      const plan = planWorkspace({ root, manifestPath, manifest });
      const applied = applyOperations({ root, plan });

      assert.equal(plan.blocked, true);
      assert.equal(plan.findings.some(({ code }) => code === 'CENTRAL_REPOSITORY_UNVERIFIED'), true);
      assert.equal(applied.blocked, true);
      assert.deepEqual(applied.applied, []);
      assert.equal(readFileSync(indexPath, 'utf8'), renderProjectIndex({ ...manifest, projects: [] }));
    } finally {
      removeFixtureRoot(outside);
      removeFixtureRoot(root);
    }
  });

  test('blocks an intermediate central symlink without changing the outside checkout', () => {
    const root = makeFixtureRoot();
    const outside = makeFixtureRoot();
    try {
      const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
      const manifest = fixtureManifest({ projects: [central] });
      const { centralPath: outsideCentralPath } = initCentralManifestRepo(outside, manifest, { indexManifest: { ...manifest, projects: [] } });
      const linkedParent = path.join(root, 'workflows/ai');
      mkdirSync(path.dirname(linkedParent), { recursive: true });
      symlinkSync(path.dirname(outsideCentralPath), linkedParent);
      const manifestPath = path.join(linkedParent, 'ai-workflow/workspace.yaml');
      const indexPath = path.join(outsideCentralPath, 'projects/index.md');

      const plan = planWorkspace({ root, manifestPath, manifest });
      const applied = applyOperations({ root, plan });

      assert.equal(plan.blocked, true);
      assert.equal(plan.findings.some(({ code }) => code === 'UNSAFE_PATH'), true);
      assert.equal(plan.findings.some(({ code }) => code === 'CENTRAL_REPOSITORY_UNVERIFIED'), true);
      assert.equal(applied.blocked, true);
      assert.deepEqual(applied.applied, []);
      assert.equal(readFileSync(indexPath, 'utf8'), renderProjectIndex({ ...manifest, projects: [] }));
    } finally {
      removeFixtureRoot(outside);
      removeFixtureRoot(root);
    }
  });

  test('blocks a final central index symlink without changing its target', () => {
    const root = makeFixtureRoot();
    const outside = makeFixtureRoot();
    try {
      const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
      const manifest = fixtureManifest({ projects: [central] });
      const { manifestPath, centralPath } = initCentralManifestRepo(root, manifest, { indexManifest: { ...manifest, projects: [] } });
      const indexPath = path.join(centralPath, 'projects/index.md');
      const sentinel = path.join(outside, 'sentinel.txt');
      writeFileSync(sentinel, 'outside remains unchanged\n', 'utf8');
      unlinkSync(indexPath);
      symlinkSync(sentinel, indexPath);

      const plan = planWorkspace({ root, manifestPath, manifest });
      const applied = applyOperations({ root, plan });

      assert.equal(plan.blocked, true);
      assert.equal(plan.findings.some(({ code }) => code === 'UNSAFE_PATH'), true);
      assert.equal(plan.findings.some(({ code }) => code === 'CENTRAL_REPOSITORY_UNVERIFIED'), true);
      assert.equal(applied.blocked, true);
      assert.deepEqual(applied.applied, []);
      assert.equal(readFileSync(sentinel, 'utf8'), 'outside remains unchanged\n');
    } finally {
      removeFixtureRoot(outside);
      removeFixtureRoot(root);
    }
  });

  test('never writes contracts into a read-only project during central convergence', () => {
    const root = makeFixtureRoot();
    const remoteRoot = makeFixtureRoot();
    try {
      const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
      const readOnly = fixtureManifest().projects.find(({ access }) => access === 'read-only');
      const manifest = fixtureManifest({ projects: [central, readOnly] });
      const { manifestPath, centralPath } = initCentralManifestRepo(root, manifest, { indexManifest: { ...manifest, projects: [central] } });
      const source = path.join(remoteRoot, 'chipin-backend');
      initFixtureRepo(source, `https://github.com/${readOnly.repository}.git`);

      const status = runWorkspaceCli(['apply', '--root', root, '--manifest', manifestPath], {
        cloneSource: { [readOnly.repository]: source },
        expectedRemote: (repository) => repository === readOnly.repository ? source : `https://github.com/${repository}.git`
      });
      const readOnlyPath = path.join(root, readOnly.localPath);

      assert.equal(status, 0);
      assert.equal(readFileSync(path.join(centralPath, 'projects/index.md'), 'utf8'), renderProjectIndex(manifest));
      assert.deepEqual(readdirSync(readOnlyPath).sort(), ['.git', '.keep']);
    } finally {
      removeFixtureRoot(remoteRoot);
      removeFixtureRoot(root);
    }
  });

  test('one CLI apply converges a new managed project and the central index', () => {
    const root = makeFixtureRoot();
    const remoteRoot = makeFixtureRoot();
    try {
      const central = fixtureManifest().projects.find(({ repository }) => repository === 'syllik/ai-workflow');
      const project = {
        id: 'syllik/new-approved-repository',
        repository: 'syllik/new-approved-repository',
        localPath: 'tools/new-approved-repository',
        group: 'tools',
        access: 'managed',
        status: 'onboarding',
        contextPath: '.ai/context.md'
      };
      const manifest = fixtureManifest({ projects: [central, project] });
      const { manifestPath, centralPath } = initCentralManifestRepo(root, manifest, { indexManifest: { ...manifest, projects: [central] } });
      const source = path.join(remoteRoot, 'new-approved-repository');
      initFixtureRepo(source, `https://github.com/${project.repository}.git`);

      const status = runWorkspaceCli(['apply', '--root', root, '--manifest', manifestPath], {
        cloneSource: { [project.repository]: source },
        expectedRemote: (repository) => repository === project.repository ? source : `https://github.com/${repository}.git`
      });
      const projectPath = path.join(root, project.localPath);

      assert.equal(status, 0);
      assert.equal(readFileSync(path.join(centralPath, 'projects/index.md'), 'utf8'), renderProjectIndex(manifest));
      assert.equal(readFileSync(path.join(projectPath, 'AGENTS.md'), 'utf8'), renderAgentsBlock(manifest));
      assert.equal(readFileSync(path.join(projectPath, project.contextPath), 'utf8'), renderContextScaffold(project));
      assert.equal(readFileSync(path.join(projectPath, '.ai/decisions.md'), 'utf8'), '# Decisions\n\nRecord durable decisions for this repository here.\n');
      assert.deepEqual(checkGeneratedFiles(root, manifest, manifestPath), []);
    } finally {
      removeFixtureRoot(remoteRoot);
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

  test('blocks each pre-existing managed contract file without applying operations', () => {
    for (const relativePath of ['AGENTS.md', '.ai/context.md', '.ai/decisions.md']) {
      const root = makeFixtureRoot();
      try {
        const project = fixtureManifest().projects[0];
        const manifest = fixtureManifest({ projects: [project] });
        const repositoryPath = path.join(root, project.localPath);
        initFixtureRepo(repositoryPath, `https://github.com/${project.repository}.git`);
        const content = `pre-existing ${relativePath}\n`;
        mkdirSync(path.dirname(path.join(repositoryPath, relativePath)), { recursive: true });
        writeFileSync(path.join(repositoryPath, relativePath), content, 'utf8');

        const plan = planWorkspace({ root, manifestPath: writeFixtureManifest(root, manifest), manifest });
        assert.equal(plan.findings.some(({ code }) => code === 'DIRTY_REPOSITORY'), true, relativePath);
        assert.deepEqual(plan.operations, [], relativePath);
        const applied = applyOperations({ root, plan });
        assert.equal(applied.blocked, true, relativePath);
        assert.deepEqual(applied.applied, [], relativePath);
        assert.equal(readFileSync(path.join(repositoryPath, relativePath), 'utf8'), content, relativePath);
      } finally {
        removeFixtureRoot(root);
      }
    }
  });

  test('does not trust pre-existing content that exactly matches a generated contract', () => {
    const root = makeFixtureRoot();
    try {
      const project = fixtureManifest().projects[0];
      const manifest = fixtureManifest({ projects: [project] });
      const repositoryPath = path.join(root, project.localPath);
      initFixtureRepo(repositoryPath, `https://github.com/${project.repository}.git`);
      writeFileSync(path.join(repositoryPath, 'AGENTS.md'), renderAgentsBlock(manifest), 'utf8');

      const plan = planWorkspace({ root, manifestPath: writeFixtureManifest(root, manifest), manifest });
      assert.equal(plan.findings.some(({ code }) => code === 'DIRTY_REPOSITORY'), true);
      assert.deepEqual(plan.operations, []);
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
      writeFileSync(path.join(root, 'AGENTS.md'), renderAgentsBlock(manifest), 'utf8');
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

  test('blocks an intermediate symlink before planning a clone', () => {
    const root = makeFixtureRoot();
    const outside = makeFixtureRoot();
    try {
      const project = fixtureManifest().projects[0];
      const manifest = fixtureManifest({ projects: [{ ...project, localPath: 'linked/repository' }] });
      const sentinel = path.join(outside, 'sentinel.txt');
      writeFileSync(sentinel, 'outside remains unchanged\n', 'utf8');
      symlinkSync(outside, path.join(root, 'linked'));

      const result = planWorkspace({ root, manifestPath: writeFixtureManifest(root, manifest), manifest });
      assert.equal(result.findings.some(({ code }) => code === 'UNSAFE_PATH'), true);
      assert.equal(result.operations.some(({ kind }) => kind === 'clone'), false);
      assert.equal(result.blocked, true);
      assert.equal(readFileSync(sentinel, 'utf8'), 'outside remains unchanged\n');
    } finally {
      removeFixtureRoot(outside);
      removeFixtureRoot(root);
    }
  });

  test('blocks an intermediate symlink before inspecting an existing repository', () => {
    const root = makeFixtureRoot();
    const outside = makeFixtureRoot();
    try {
      const project = fixtureManifest().projects[0];
      const manifest = fixtureManifest({ projects: [{ ...project, localPath: 'linked/repository' }] });
      const outsideRepository = path.join(outside, 'repository');
      initFixtureRepo(outsideRepository, `https://github.com/${project.repository}.git`);
      symlinkSync(outside, path.join(root, 'linked'));
      const sentinel = path.join(outsideRepository, 'sentinel.txt');
      writeFileSync(sentinel, 'outside remains unchanged\n', 'utf8');

      const result = planWorkspace({ root, manifestPath: writeFixtureManifest(root, manifest), manifest });
      assert.equal(result.findings.some(({ code }) => code === 'UNSAFE_PATH'), true);
      assert.deepEqual(result.operations, []);
      assert.equal(result.blocked, true);
      assert.equal(readFileSync(sentinel, 'utf8'), 'outside remains unchanged\n');
    } finally {
      removeFixtureRoot(outside);
      removeFixtureRoot(root);
    }
  });

  test('blocks generated writes when an existing repository descendant is a symlink', () => {
    const root = makeFixtureRoot();
    const outside = makeFixtureRoot();
    try {
      const project = fixtureManifest().projects[0];
      const manifest = fixtureManifest({ projects: [project] });
      const repositoryPath = path.join(root, project.localPath);
      initFixtureRepo(repositoryPath, `https://github.com/${project.repository}.git`);
      const sentinel = path.join(outside, 'sentinel.txt');
      writeFileSync(sentinel, 'outside remains unchanged\n', 'utf8');
      symlinkSync(outside, path.join(repositoryPath, '.ai'));

      const plan = planWorkspace({ root, manifestPath: writeFixtureManifest(root, manifest), manifest });
      assert.equal(plan.findings.some(({ code }) => code === 'UNSAFE_PATH'), true);
      assert.equal(plan.blocked, true);
      const applied = applyOperations({ root, plan });
      assert.equal(applied.blocked, true);
      assert.deepEqual(applied.applied, []);
      assert.equal(existsSync(path.join(repositoryPath, 'AGENTS.md')), false);
      assert.equal(readFileSync(sentinel, 'utf8'), 'outside remains unchanged\n');
    } finally {
      removeFixtureRoot(outside);
      removeFixtureRoot(root);
    }
  });

  test('blocks budget collection through an intermediate symlink', () => {
    const root = makeFixtureRoot();
    const outside = makeFixtureRoot();
    try {
      const project = fixtureManifest().projects[0];
      const manifest = fixtureManifest({ projects: [project] });
      const repositoryPath = path.join(root, project.localPath);
      initFixtureRepo(repositoryPath, `https://github.com/${project.repository}.git`);
      writeFileSync(path.join(repositoryPath, 'AGENTS.md'), renderAgentsBlock(manifest), 'utf8');
      mkdirSync(path.join(repositoryPath, '.ai'), { recursive: true });
      writeFileSync(path.join(repositoryPath, project.contextPath), renderContextScaffold(project), 'utf8');
      writeFileSync(path.join(repositoryPath, '.ai/decisions.md'), '# Decisions\n', 'utf8');
      const outsideTaskRoot = path.join(outside, 'tasks');
      mkdirSync(outsideTaskRoot, { recursive: true });
      writeFileSync(path.join(outsideTaskRoot, 'prompt.md'), 'x'.repeat(8193), 'utf8');
      symlinkSync(outsideTaskRoot, path.join(repositoryPath, '.ai/tasks'));
      const sentinel = path.join(outsideTaskRoot, 'sentinel.txt');
      writeFileSync(sentinel, 'outside remains unchanged\n', 'utf8');

      const findings = checkGeneratedFiles(root, manifest, writeFixtureManifest(root, manifest));
      assert.equal(findings.some(({ code }) => code === 'UNSAFE_PATH'), true);
      assert.equal(readFileSync(sentinel, 'utf8'), 'outside remains unchanged\n');
    } finally {
      removeFixtureRoot(outside);
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

  test('checks only known central and managed artifacts, including human plan budgets', () => {
    const manifestRoot = makeFixtureRoot();
    const root = makeFixtureRoot();
    try {
      const managed = fixtureManifest().projects[0];
      const readOnly = fixtureManifest().projects[2];
      const manifest = fixtureManifest({ projects: [managed, readOnly] });
      const manifestPath = writeFixtureManifest(manifestRoot, manifest);
      mkdirSync(path.join(manifestRoot, 'global'), { recursive: true });
      mkdirSync(path.join(manifestRoot, '.ai/tasks/central-task'), { recursive: true });
      writeFileSync(path.join(manifestRoot, 'global/architect.md'), 'x'.repeat(6145), 'utf8');
      writeFileSync(path.join(manifestRoot, '.ai/tasks/central-task/plan.md'), 'x'.repeat(16385), 'utf8');
      mkdirSync(path.join(manifestRoot, 'projects'), { recursive: true });
      writeFileSync(path.join(manifestRoot, 'projects/index.md'), renderProjectIndex(manifest), 'utf8');

      const managedPath = path.join(root, managed.localPath);
      initFixtureRepo(managedPath, `https://github.com/${managed.repository}.git`);
      mkdirSync(path.join(managedPath, '.ai/tasks/target-task'), { recursive: true });
      writeFileSync(path.join(managedPath, managed.contextPath), 'x'.repeat(8193), 'utf8');
      writeFileSync(path.join(managedPath, '.ai/tasks/target-task/prompt.md'), 'x'.repeat(8193), 'utf8');
      writeFileSync(path.join(managedPath, 'AGENTS.md'), renderAgentsBlock(manifest), 'utf8');
      writeFileSync(path.join(managedPath, '.ai/decisions.md'), '# Decisions\n', 'utf8');

      const readOnlyPath = path.join(root, readOnly.localPath);
      initFixtureRepo(readOnlyPath, `https://github.com/${readOnly.repository}.git`);
      mkdirSync(path.join(readOnlyPath, '.ai/tasks/should-not-read'), { recursive: true });
      writeFileSync(path.join(readOnlyPath, '.ai/tasks/should-not-read/result.md'), 'x'.repeat(4097), 'utf8');
      mkdirSync(path.join(root, 'unrelated/build-output'), { recursive: true });
      writeFileSync(path.join(root, 'unrelated/build-output/unrelated.bin'), 'x'.repeat(100000), 'utf8');

      const findings = checkGeneratedFiles(root, manifest, manifestPath);
      const budgetPaths = findings.filter(({ code }) => code === 'BUDGET_EXCEEDED').map(({ path: findingPath }) => findingPath);
      assert.equal(budgetPaths.includes('global/architect.md'), true);
      assert.equal(budgetPaths.includes('.ai/tasks/central-task/plan.md'), true);
      assert.equal(budgetPaths.includes(`${managed.localPath}/${managed.contextPath}`), true);
      assert.equal(budgetPaths.includes(`${managed.localPath}/.ai/tasks/target-task/prompt.md`), true);
      assert.equal(budgetPaths.some((findingPath) => findingPath.includes(readOnly.localPath)), false);
      assert.equal(budgetPaths.includes('unrelated/build-output/unrelated.bin'), false);
    } finally {
      removeFixtureRoot(manifestRoot);
      removeFixtureRoot(root);
    }
  });
});
