import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkBudget, BUDGETS } from './budgets.mjs';
import { DEFAULT_MANIFEST_PATH, loadManifest, validateManifest } from './manifest.mjs';
import { markerState, renderAgentsBlock, renderContextScaffold, renderDecisionsScaffold, renderProjectIndex, replaceManagedBlock } from './render.mjs';

export const OPERATION_KINDS = Object.freeze(['clone', 'create-file', 'replace-managed-block', 'replace-generated-file']);

const GENERATED_OUTPUT_TOKEN = {};
const CENTRAL_REPOSITORY = 'syllik/ai-workflow';
const CENTRAL_INDEX_PATH = 'projects/index.md';
const CENTRAL_IDENTITY_FINDING = 'CENTRAL_REPOSITORY_UNVERIFIED';

function generatedOutputs(entries) {
  return Object.freeze({
    token: GENERATED_OUTPUT_TOKEN,
    entries: Object.freeze(entries.map((entry) => Object.freeze({ ...entry })))
  });
}

function finding(code, filePath, details = {}) {
  return { code, path: filePath, ...details };
}

function normalizeText(text) {
  return `${String(text).replaceAll('\r\n', '\n').replaceAll('\r', '\n').replace(/\n+$/u, '')}\n`;
}

function fingerprint(filePath) {
  try {
    if (!lstatSync(filePath).isFile()) return null;
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
  } catch {
    return null;
  }
}

function contentFingerprint(content) {
  return createHash('sha256').update(normalizeText(content), 'utf8').digest('hex');
}

function atomicWriteFile(filePath, content) {
  let temporaryDirectory;
  try {
    try {
      if (lstatSync(filePath).isSymbolicLink()) throw new Error('Generated output destination is a symlink');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    temporaryDirectory = mkdtempSync(path.join(path.dirname(filePath), '.ai-workflow-generated-'));
    const temporaryFile = path.join(temporaryDirectory, 'output');
    writeFileSync(temporaryFile, normalizeText(content), 'utf8');
    renameSync(temporaryFile, filePath);
  } finally {
    if (temporaryDirectory) {
      try {
        rmSync(temporaryDirectory, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup of the private temporary directory.
      }
    }
  }
}

function isPathInside(base, target) {
  const relative = path.relative(base, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function rootPaths(root) {
  const requestedRoot = path.resolve(root);
  try {
    const rootStat = lstatSync(requestedRoot);
    if (!rootStat.isDirectory() && !rootStat.isSymbolicLink()) return null;
    const realRoot = realpathSync(requestedRoot);
    return lstatSync(realRoot).isDirectory() ? { requestedRoot, realRoot } : null;
  } catch {
    return null;
  }
}

function trustedRoot(root) {
  return rootPaths(root)?.realRoot ?? null;
}

function resolveInside(root, relativePath) {
  if (typeof relativePath !== 'string') return null;
  const roots = rootPaths(root);
  if (!roots) return null;
  const { requestedRoot: base, realRoot } = roots;
  const target = path.resolve(base, relativePath);
  if (!isPathInside(base, target)) return null;

  let current = base;
  const relative = path.relative(base, target);
  for (const segment of relative ? relative.split(path.sep) : []) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      return null;
    }
    if (stat.isSymbolicLink()) return null;
    try {
      if (!isPathInside(realRoot, realpathSync(current))) return null;
    } catch {
      return null;
    }
  }
  return target;
}

function command(directory, args) {
  try {
    return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trimEnd();
  } catch {
    return null;
  }
}

function normalizedRemote(value) {
  if (!value) return null;
  let remote = value.trim();
  if (remote.startsWith('git@github.com:')) remote = `https://github.com/${remote.slice('git@github.com:'.length)}`;
  remote = remote.replace(/^ssh:\/\/git@github\.com\//u, 'https://github.com/');
  return remote.replace(/\/+$/u, '').replace(/\.git$/u, '').toLowerCase();
}

function expectedRemote(repository) {
  return `https://github.com/${repository}.git`;
}

function resolveExpectedRemote(repository, options = {}) {
  if (typeof options.expectedRemote === 'function') return options.expectedRemote(repository);
  if (options.expectedRemote && typeof options.expectedRemote === 'object') return options.expectedRemote[repository] ?? expectedRemote(repository);
  return expectedRemote(repository);
}

function resolveCloneSource(repository, options = {}) {
  if (typeof options.cloneSource === 'function') return options.cloneSource(repository);
  if (options.cloneSource && typeof options.cloneSource === 'object') return options.cloneSource[repository] ?? null;
  return null;
}

function centralManifestIdentity(root, manifest, manifestPath, findings, options = {}) {
  const resolvedManifestPath = path.resolve(manifestPath);
  const manifestRoot = path.dirname(resolvedManifestPath);
  const centralProject = manifest?.projects?.find(({ id, repository, access }) => id === CENTRAL_REPOSITORY && repository === CENTRAL_REPOSITORY && access === 'managed');
  const relativeManifestRoot = path.relative(root, manifestRoot);
  const manifestFile = resolveInside(root, path.relative(root, resolvedManifestPath));
  const centralDestination = centralProject ? resolveInside(root, centralProject.localPath) : null;
  const mappedManifestRoot = resolveInside(root, relativeManifestRoot);
  const pathMatches = centralDestination
    && mappedManifestRoot
    && path.resolve(centralDestination) === path.resolve(manifestRoot)
    && path.resolve(mappedManifestRoot) === path.resolve(manifestRoot)
    && manifestFile
    && path.resolve(path.dirname(manifestFile)) === path.resolve(manifestRoot)
    && isRegularFile(manifestFile);
  if (!pathMatches) {
    addUniqueFinding(findings, CENTRAL_IDENTITY_FINDING, CENTRAL_INDEX_PATH);
    return null;
  }
  let realManifestRoot;
  let realCentralDestination;
  try {
    realManifestRoot = realpathSync(manifestRoot);
    realCentralDestination = realpathSync(centralDestination);
  } catch {
    addUniqueFinding(findings, CENTRAL_IDENTITY_FINDING, CENTRAL_INDEX_PATH);
    return null;
  }
  if (realManifestRoot !== realCentralDestination || !isPathInside(trustedRoot(root), realManifestRoot)) {
    addUniqueFinding(findings, CENTRAL_IDENTITY_FINDING, CENTRAL_INDEX_PATH);
    return null;
  }
  const safe = repositorySafety(
    centralDestination,
    CENTRAL_REPOSITORY,
    centralProject.localPath,
    findings,
    resolveExpectedRemote(CENTRAL_REPOSITORY, options),
    options.generatedOutputs
  );
  if (!safe) {
    addUniqueFinding(findings, CENTRAL_IDENTITY_FINDING, CENTRAL_INDEX_PATH);
    return null;
  }
  const indexPath = resolveInside(centralDestination, CENTRAL_INDEX_PATH);
  if (!indexPath) {
    addUniqueFinding(findings, CENTRAL_IDENTITY_FINDING, CENTRAL_INDEX_PATH);
    return null;
  }
  return { centralProject, centralDestination, indexPath, operationPath: path.posix.join(centralProject.localPath, CENTRAL_INDEX_PATH) };
}

function hasGitMetadata(directoryPath) {
  try {
    const stat = lstatSync(path.join(directoryPath, '.git'));
    return stat.isDirectory() || stat.isFile() || stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function addCentralGeneratedIndexOperation(root, operations, findings, manifest, manifestPath, options = {}) {
  const manifestRoot = path.dirname(path.resolve(manifestPath));
  if (!hasGitMetadata(manifestRoot)) return;
  const candidate = resolveInside(manifestRoot, CENTRAL_INDEX_PATH);
  const desired = renderProjectIndex(manifest);
  let drift = !candidate || !isRegularFile(candidate);
  if (!drift) {
    try {
      drift = readFileSync(candidate, 'utf8') !== desired;
    } catch {
      drift = true;
    }
  }
  if (!drift) return;
  const identity = centralManifestIdentity(root, manifest, manifestPath, findings, options);
  if (!identity) return;
  if (existsSync(identity.indexPath) && !isRegularFile(identity.indexPath)) {
    addUniqueFinding(findings, 'DESTINATION_COLLISION', identity.operationPath);
    return;
  }
  operations.push({
    kind: 'replace-generated-file',
    path: identity.operationPath,
    destination: identity.indexPath,
    generatedPath: CENTRAL_INDEX_PATH,
    content: desired,
    expectedFingerprint: fingerprint(identity.indexPath),
    repositoryPath: identity.centralProject.localPath,
    repository: CENTRAL_REPOSITORY
  });
}

function repositorySafety(destination, repository, localPath, findings, expectedOrigin = expectedRemote(repository), generatedOutputs = null) {
  const gitPath = path.join(destination, '.git');
  let gitStat;
  try {
    gitStat = lstatSync(gitPath);
  } catch {
    findings.push(finding('DESTINATION_COLLISION', localPath));
    return false;
  }
  if (gitStat.isSymbolicLink()) {
    findings.push(finding('UNSAFE_PATH', path.posix.join(localPath, '.git')));
    return false;
  }
  if (gitStat.isFile()) {
    findings.push(finding('WORKTREE_COLLISION', localPath));
    return false;
  }
  const gitRoot = command(destination, ['rev-parse', '--show-toplevel']);
  let valid = true;
  if (!gitRoot || path.resolve(gitRoot) !== path.resolve(realpathSync(destination))) {
    findings.push(finding('GIT_ROOT_MISMATCH', localPath));
    valid = false;
  }
  const origin = command(destination, ['config', '--get', 'remote.origin.url']);
  if (normalizedRemote(origin) !== normalizedRemote(expectedOrigin)) {
    findings.push(finding('ORIGIN_MISMATCH', localPath));
    valid = false;
  }
  const status = command(destination, ['status', '--porcelain', '--untracked-files=all']) ?? '';
  const statusPaths = status.split('\n').filter(Boolean).map((line) => line.slice(3).trim());
  for (const statusPath of statusPaths) {
    if (!resolveInside(destination, statusPath)) findings.push(finding('UNSAFE_PATH', path.posix.join(localPath, statusPath)));
  }
  const unexpectedStatusPaths = statusPaths.filter((statusPath) => !isGeneratedOutput(statusPath, destination, localPath, generatedOutputs));
  if (unexpectedStatusPaths.length > 0) {
    findings.push(finding('DIRTY_REPOSITORY', localPath));
    valid = false;
  }
  const worktrees = command(destination, ['worktree', 'list', '--porcelain']) ?? '';
  const worktreeCount = worktrees.split(/^worktree /mu).length - 1;
  if (worktreeCount > 1) {
    findings.push(finding('MULTI_WORKTREE', localPath));
    valid = false;
  }
  return valid;
}

function isGeneratedOutput(statusPath, repositoryDestination, repositoryPath, generatedOutputs) {
  if (generatedOutputs?.token !== GENERATED_OUTPUT_TOKEN) return false;
  const workspacePath = path.posix.join(repositoryPath, statusPath);
  const destination = resolveInside(repositoryDestination, statusPath);
  if (!destination) return false;
  const currentFingerprint = fingerprint(destination);
  return generatedOutputs.entries.some((entry) => entry.path === workspacePath && entry.fingerprint === currentFingerprint);
}

function addManagedFileOperation(root, operations, findings, relativePath, name, desiredBlock, repository) {
  const destination = resolveInside(root, relativePath);
  if (!destination) {
    findings.push(finding('UNSAFE_PATH', relativePath));
    return;
  }
  const current = existsSync(destination) ? readFileSync(destination, 'utf8') : null;
  if (current === null) {
    operations.push({ kind: 'create-file', path: relativePath, destination, content: desiredBlock, ...repository });
    return;
  }
  if (!lstatSync(destination).isFile()) {
    findings.push(finding('DESTINATION_COLLISION', relativePath));
    return;
  }
  const state = markerState(current, name);
  if (state.kind === 'duplicate') {
    findings.push(finding('DUPLICATE_MARKER', relativePath));
    return;
  }
  if (state.kind === 'malformed') {
    findings.push(finding('MALFORMED_MARKER', relativePath));
    return;
  }
  const content = replaceManagedBlock(current, name, desiredBlock);
  if (content !== normalizeText(current)) {
    operations.push({
      kind: 'replace-managed-block',
      path: relativePath,
      destination,
      marker: name,
      block: desiredBlock,
      content,
      expectedFingerprint: fingerprint(destination),
      ...repository
    });
  }
}

function addDecisionsOperation(root, operations, findings, project) {
  const relativePath = path.posix.join(project.localPath, '.ai/decisions.md');
  const destination = resolveInside(root, relativePath);
  if (!destination) {
    findings.push(finding('UNSAFE_PATH', relativePath));
    return;
  }
  if (!existsSync(destination)) {
    operations.push({
      kind: 'create-file',
      path: relativePath,
      destination,
      content: renderDecisionsScaffold(),
      repositoryPath: project.localPath,
      repository: project.repository
    });
  } else if (!lstatSync(destination).isFile()) {
    findings.push(finding('DESTINATION_COLLISION', relativePath));
  }
}

function addContextOperation(root, operations, findings, project) {
  const projectDestination = resolveInside(root, project.localPath);
  const relativePath = path.posix.join(project.localPath, project.contextPath);
  const destination = projectDestination && resolveInside(projectDestination, project.contextPath);
  if (!projectDestination || !destination) {
    findings.push(finding('UNSAFE_PATH', relativePath));
    return;
  }
  const desired = renderContextScaffold(project);
  if (!existsSync(destination)) {
    findings.push(...checkBudget({ path: relativePath, text: desired }, BUDGETS));
    operations.push({
      kind: 'create-file',
      path: relativePath,
      destination,
      content: desired,
      repositoryPath: project.localPath,
      repository: project.repository
    });
    return;
  }
  if (!lstatSync(destination).isFile()) {
    findings.push(finding('DESTINATION_COLLISION', relativePath));
    return;
  }
  findings.push(...checkBudget({ path: relativePath, text: readFileSync(destination, 'utf8') }, BUDGETS));
}

export function planWorkspace(options = {}) {
  const requestedRoot = path.resolve(options.root ?? process.cwd());
  const root = requestedRoot;
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST_PATH;
  let manifest = options.manifest;
  const findings = [];
  if (!manifest) {
    try {
      manifest = loadManifest(manifestPath);
    } catch {
      findings.push(finding('MANIFEST_UNREADABLE', path.relative(root, manifestPath) || 'workspace.yaml'));
      return { root, manifestPath, manifest: null, operations: [], findings, blocked: false, validationFailed: true, drift: false, fingerprints: {} };
    }
  }
  const validation = validateManifest(manifest);
  findings.push(...validation.findings);
  if (!validation.valid) return { root, manifestPath, manifest, operations: [], findings, blocked: false, validationFailed: true, drift: false, fingerprints: {} };
  if (!trustedRoot(root)) {
    findings.push(finding('ROOT_NOT_DIRECTORY', root));
    return { root, manifestPath, manifest, operations: [], findings, blocked: true, validationFailed: false, drift: false, fingerprints: {} };
  }

  const operations = [];
  const projects = [...manifest.projects];
  for (const project of projects) {
    const destination = resolveInside(root, project.localPath);
    if (!destination) {
      findings.push(finding('UNSAFE_PATH', `manifest.projects[${projects.indexOf(project)}].localPath`));
      continue;
    }
    if (!existsSync(destination)) {
      const source = resolveCloneSource(project.repository, options);
      const operation = { kind: 'clone', repository: project.repository, path: project.localPath, destination };
      if (source !== null) operation.source = source;
      operations.push(operation);
      continue;
    }
    if (!lstatSync(destination).isDirectory()) {
      findings.push(finding('DESTINATION_COLLISION', project.localPath));
      continue;
    }
    const safeRepository = repositorySafety(destination, project.repository, project.localPath, findings, resolveExpectedRemote(project.repository, options), options.generatedOutputs);
    if (!safeRepository) continue;
    if (project.access === 'managed') {
      const repository = { repositoryPath: project.localPath, repository: project.repository };
      addManagedFileOperation(root, operations, findings, path.posix.join(project.localPath, 'AGENTS.md'), 'agents-routing', renderAgentsBlock(manifest), repository);
      addContextOperation(root, operations, findings, project);
      addDecisionsOperation(root, operations, findings, project);
    }
  }

  addCentralGeneratedIndexOperation(root, operations, findings, manifest, manifestPath, options);

  const blockedCodes = new Set(['DESTINATION_COLLISION', 'WORKTREE_COLLISION', 'GIT_ROOT_MISMATCH', 'ORIGIN_MISMATCH', 'DIRTY_REPOSITORY', 'MULTI_WORKTREE', 'DUPLICATE_MARKER', 'MALFORMED_MARKER', 'UNSAFE_PATH', 'BUDGET_EXCEEDED', CENTRAL_IDENTITY_FINDING]);
  const blocked = findings.some(({ code }) => blockedCodes.has(code));
  const fingerprints = Object.fromEntries(operations.map((operation) => [operation.path, fingerprint(operation.destination)]));
  return { root, manifestPath, manifest, operations, findings, blocked, validationFailed: false, drift: findings.some(({ code }) => code === 'GENERATED_DRIFT'), fingerprints };
}

function preflightOperation(root, operation, plan, findings, options = {}) {
  if (!OPERATION_KINDS.includes(operation.kind)) {
    findings.push(finding('UNSUPPORTED_OPERATION', operation.path ?? 'operation'));
    return;
  }
  const destination = resolveInside(root, operation.path);
  if (!destination || destination !== path.resolve(operation.destination)) {
    findings.push(finding('UNSAFE_PATH', operation.path ?? 'operation'));
    return;
  }
  const expected = plan.fingerprints?.[operation.path] ?? operation.expectedFingerprint ?? null;
  const current = fingerprint(destination);
  if (current !== expected) {
    findings.push(finding('FIRST_DRIFT', operation.path));
    return;
  }
  if (operation.kind === 'clone' && existsSync(destination)) findings.push(finding('FIRST_DRIFT', operation.path));
  if (operation.kind === 'create-file' && existsSync(destination)) findings.push(finding('FIRST_DRIFT', operation.path));
  if (operation.kind === 'replace-managed-block') {
    if (!existsSync(destination)) {
      findings.push(finding('FIRST_DRIFT', operation.path));
      return;
    }
    const currentText = readFileSync(destination, 'utf8');
    const state = markerState(currentText, operation.marker);
    if (state.kind === 'duplicate') findings.push(finding('DUPLICATE_MARKER', operation.path));
    else if (state.kind === 'malformed') findings.push(finding('MALFORMED_MARKER', operation.path));
    else {
      let expectedContent;
      try {
        expectedContent = replaceManagedBlock(currentText, operation.marker, operation.block);
      } catch {
        findings.push(finding('MALFORMED_MARKER', operation.path));
        return;
      }
      if (expectedContent !== operation.content) findings.push(finding('FIRST_DRIFT', operation.path));
    }
  }
  if (operation.kind === 'replace-generated-file') {
    const identity = centralManifestIdentity(root, plan.manifest, plan.manifestPath, findings, options);
    const matchesIdentity = identity
      && operation.repository === CENTRAL_REPOSITORY
      && operation.repositoryPath === identity.centralProject.localPath
      && operation.generatedPath === CENTRAL_INDEX_PATH
      && operation.path === identity.operationPath
      && path.resolve(operation.destination) === path.resolve(identity.indexPath);
    if (!matchesIdentity) {
      addUniqueFinding(findings, 'UNSAFE_PATH', operation.path ?? 'operation');
      return;
    }
    if (operation.content !== renderProjectIndex(plan.manifest)) {
      addUniqueFinding(findings, 'GENERATED_CONTENT_MISMATCH', operation.path);
    }
    if (existsSync(destination) && !isRegularFile(destination)) {
      addUniqueFinding(findings, 'DESTINATION_COLLISION', operation.path);
    }
  }
  if (operation.repositoryPath && operation.kind !== 'replace-generated-file' && existsSync(resolveInside(root, operation.repositoryPath))) {
    const repositoryDestination = resolveInside(root, operation.repositoryPath);
    repositorySafety(repositoryDestination, operation.repository, operation.repositoryPath, findings, resolveExpectedRemote(operation.repository, options), options.generatedOutputs);
  }
}

export function applyOperations(options = {}) {
  const plan = options.plan;
  const requestedRoot = path.resolve(options.root ?? plan?.root ?? process.cwd());
  const root = requestedRoot;
  const findings = [];
  if (!plan || !Array.isArray(plan.operations)) return { root, applied: [], findings: [finding('INVALID_PLAN', 'plan')], blocked: true };
  if (!trustedRoot(root)) return { root, applied: [], findings: [finding('ROOT_NOT_DIRECTORY', root)], blocked: true };
  if (plan.blocked || plan.validationFailed) return { root, applied: [], findings: plan.findings ?? [finding('DIRTY_REPOSITORY', 'workspace')], blocked: true };
  for (const operation of plan.operations) preflightOperation(root, operation, { ...plan, fingerprints: options.expectedFingerprints ?? plan.fingerprints }, findings, options);
  if (findings.length > 0) return { root, applied: [], findings, blocked: true };

  const applied = [];
  const generatedEntries = options.generatedOutputs?.token === GENERATED_OUTPUT_TOKEN
    ? [...options.generatedOutputs.entries]
    : [];
  try {
    for (const operation of plan.operations) {
      let destination = resolveInside(root, operation.path);
      if (!destination || destination !== path.resolve(operation.destination)) {
        findings.push(finding('UNSAFE_PATH', operation.path));
        return { root, applied, findings, generatedOutputs: generatedOutputs(generatedEntries), blocked: true };
      }
      if (operation.kind === 'replace-generated-file') {
        const findingsBeforeRevalidation = findings.length;
        preflightOperation(root, operation, { ...plan, fingerprints: options.expectedFingerprints ?? plan.fingerprints }, findings, {
          ...options,
          generatedOutputs: generatedOutputs(generatedEntries)
        });
        if (findings.length > findingsBeforeRevalidation) {
          return { root, applied, findings, generatedOutputs: generatedOutputs(generatedEntries), blocked: true };
        }
      }
      if (operation.kind === 'clone') {
        mkdirSync(path.dirname(destination), { recursive: true });
        destination = resolveInside(root, operation.path);
        if (!destination || destination !== path.resolve(operation.destination) || existsSync(destination)) {
          findings.push(finding('UNSAFE_PATH', operation.path));
          return { root, applied, findings, generatedOutputs: generatedOutputs(generatedEntries), blocked: true };
        }
        execFileSync('git', ['clone', '--quiet', operation.source ?? resolveExpectedRemote(operation.repository, options), destination], { stdio: 'pipe' });
      } else {
        mkdirSync(path.dirname(destination), { recursive: true });
        destination = resolveInside(root, operation.path);
        if (!destination || destination !== path.resolve(operation.destination)) {
          findings.push(finding('UNSAFE_PATH', operation.path));
          return { root, applied, findings, generatedOutputs: generatedOutputs(generatedEntries), blocked: true };
        }
        const expectedFingerprint = contentFingerprint(operation.content);
        if (operation.kind === 'replace-generated-file') atomicWriteFile(destination, operation.content);
        else writeFileSync(destination, normalizeText(operation.content), 'utf8');
        if (fingerprint(destination) !== expectedFingerprint) throw new Error('Generated output fingerprint mismatch');
        generatedEntries.push({ path: operation.path, fingerprint: expectedFingerprint });
      }
      applied.push(operation.path);
    }
  } catch (error) {
    findings.push(finding('APPLY_FAILED', applied.length < plan.operations.length ? plan.operations[applied.length]?.path ?? 'operation' : 'operation', { message: error.message }));
    return { root, applied, findings, generatedOutputs: generatedOutputs(generatedEntries), blocked: true };
  }
  return { root, applied, findings, generatedOutputs: generatedOutputs(generatedEntries), blocked: false };
}

const TASK_ARTIFACT_NAMES = new Set(['plan.md', 'prompt.md', 'state.md', 'result.md']);

function isRegularFile(filePath) {
  try {
    return lstatSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isDirectory(directoryPath) {
  try {
    return lstatSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
}

function physicalPath(filePath) {
  try {
    return isRegularFile(filePath)
      ? realpathSync(filePath)
      : path.join(realpathSync(path.dirname(filePath)), path.basename(filePath));
  } catch {
    return filePath;
  }
}

function addUniqueFinding(findings, code, filePath) {
  if (!findings.some((entry) => entry.code === code && entry.path === filePath)) findings.push(finding(code, filePath));
}

function readKnownArtifact(root, relativePath, findings = null) {
  const filePath = resolveInside(root, relativePath);
  if (!filePath) {
    if (findings) addUniqueFinding(findings, 'UNSAFE_PATH', relativePath);
    return null;
  }
  if (!isRegularFile(filePath)) return null;
  try {
    return { path: relativePath, text: readFileSync(filePath, 'utf8') };
  } catch {
    return null;
  }
}

function collectTaskArtifacts(root, taskRootRelative, findings = null) {
  const taskRoot = resolveInside(root, taskRootRelative);
  if (!taskRoot) {
    if (findings) addUniqueFinding(findings, 'UNSAFE_PATH', taskRootRelative);
    return [];
  }
  if (!isDirectory(taskRoot)) return [];
  const output = [];
  function visit(directoryPath, relativeDirectory) {
    let entries;
    try {
      entries = readdirSync(directoryPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const entryRelative = path.posix.join(relativeDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        if (findings) addUniqueFinding(findings, 'UNSAFE_PATH', entryRelative);
        continue;
      }
      const safeEntryPath = resolveInside(root, entryRelative);
      if (!safeEntryPath) {
        if (findings) addUniqueFinding(findings, 'UNSAFE_PATH', entryRelative);
        continue;
      }
      if (entry.isDirectory()) visit(safeEntryPath, entryRelative);
      else if (entry.isFile() && TASK_ARTIFACT_NAMES.has(entry.name)) {
        const artifact = readKnownArtifact(root, entryRelative, findings);
        if (artifact) output.push(artifact);
      }
    }
  }
  visit(taskRoot, taskRootRelative);
  return output;
}

function collectKnownBudgetArtifacts(root, manifest, manifestPath, findings = null) {
  const manifestRoot = trustedRoot(path.dirname(path.resolve(manifestPath))) ?? path.dirname(path.resolve(manifestPath));
  const entries = [];
  for (const relativePath of ['AI.md', 'FLOW.md']) {
    const artifact = readKnownArtifact(manifestRoot, relativePath, findings);
    if (artifact) entries.push(artifact);
  }

  const globalDirectory = resolveInside(manifestRoot, 'global');
  if (!globalDirectory && findings) addUniqueFinding(findings, 'UNSAFE_PATH', 'global');
  if (isDirectory(globalDirectory)) {
    try {
      for (const entry of readdirSync(globalDirectory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
        if (entry.isSymbolicLink()) {
          if (findings) addUniqueFinding(findings, 'UNSAFE_PATH', path.posix.join('global', entry.name));
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const artifact = readKnownArtifact(manifestRoot, path.posix.join('global', entry.name), findings);
        if (artifact) entries.push(artifact);
      }
    } catch {
      // Unreadable optional central artifacts are skipped safely.
    }
  }
  entries.push(...collectTaskArtifacts(manifestRoot, '.ai/tasks', findings));

  for (const project of manifest.projects.filter(({ access }) => access === 'managed')) {
    const repository = resolveInside(root, project.localPath);
    if (!repository) {
      if (findings) addUniqueFinding(findings, 'UNSAFE_PATH', project.localPath);
      continue;
    }
    if (!isDirectory(repository)) continue;
    for (const relativePath of [project.contextPath, '.ai/decisions.md']) {
      const artifact = readKnownArtifact(repository, relativePath, findings);
      if (artifact) entries.push({ path: path.posix.join(project.localPath, artifact.path), text: artifact.text });
    }
    entries.push(...collectTaskArtifacts(root, path.posix.join(project.localPath, '.ai/tasks'), findings));
  }
  return entries;
}

export function checkGeneratedFiles(root, manifest, manifestPath = DEFAULT_MANIFEST_PATH) {
  const requestedWorkspaceRoot = path.resolve(root);
  const workspaceRoot = requestedWorkspaceRoot;
  const findings = [];
  const manifestRoot = trustedRoot(path.dirname(path.resolve(manifestPath))) ?? path.dirname(path.resolve(manifestPath));
  const indexPath = resolveInside(manifestRoot, 'projects/index.md');
  if (!indexPath) addUniqueFinding(findings, 'UNSAFE_PATH', 'projects/index.md');
  else if (!isRegularFile(indexPath) || readFileSync(indexPath, 'utf8') !== renderProjectIndex(manifest)) findings.push(finding('GENERATED_DRIFT', 'projects/index.md'));

  const checkedAgents = new Set();
  const checkAgents = (repositoryRoot, relativePath, findingPath) => {
    const agentsPath = resolveInside(repositoryRoot, relativePath);
    if (!agentsPath) {
      addUniqueFinding(findings, 'UNSAFE_PATH', findingPath);
      return;
    }
    const identity = physicalPath(agentsPath);
    if (checkedAgents.has(identity)) return;
    checkedAgents.add(identity);
    const desiredAgents = renderAgentsBlock(manifest);
    if (!isRegularFile(agentsPath)) findings.push(finding('GENERATED_DRIFT', findingPath));
    else {
      const current = readFileSync(agentsPath, 'utf8');
      const state = markerState(current, 'agents-routing');
      if (state.kind !== 'valid' || replaceManagedBlock(current, 'agents-routing', desiredAgents) !== normalizeText(current)) findings.push(finding('GENERATED_DRIFT', findingPath));
    }
  };

  checkAgents(manifestRoot, 'AGENTS.md', 'AGENTS.md');
  for (const project of manifest.projects.filter(({ access }) => access === 'managed')) {
    const repository = resolveInside(workspaceRoot, project.localPath);
    if (!repository) {
      addUniqueFinding(findings, 'UNSAFE_PATH', project.localPath);
      continue;
    }
    if (!isDirectory(repository)) continue;
    checkAgents(repository, 'AGENTS.md', path.posix.join(project.localPath, 'AGENTS.md'));
    const contextPath = resolveInside(repository, project.contextPath);
    if (!contextPath || !isRegularFile(contextPath)) {
      if (!contextPath) addUniqueFinding(findings, 'UNSAFE_PATH', path.posix.join(project.localPath, project.contextPath));
      else findings.push(finding('GENERATED_DRIFT', path.posix.join(project.localPath, project.contextPath)));
    }
    const decisionsPath = resolveInside(repository, '.ai/decisions.md');
    if (!decisionsPath || !isRegularFile(decisionsPath)) {
      if (!decisionsPath) addUniqueFinding(findings, 'UNSAFE_PATH', path.posix.join(project.localPath, '.ai/decisions.md'));
      else findings.push(finding('GENERATED_DRIFT', path.posix.join(project.localPath, '.ai/decisions.md')));
    }
  }
  const budgetEntries = collectKnownBudgetArtifacts(workspaceRoot, manifest, manifestPath, findings);
  findings.push(...budgetEntries.flatMap((entry) => checkBudget(entry, BUDGETS)));
  const budgetAgents = new Set();
  const checkAgentBudget = (agentsPath) => {
    if (!agentsPath || !isRegularFile(agentsPath)) return;
    const identity = realpathSync(agentsPath);
    if (budgetAgents.has(identity)) return;
    budgetAgents.add(identity);
    const agents = readFileSync(agentsPath, 'utf8');
    const state = markerState(agents, 'agents-routing');
    if (state.kind === 'valid') {
      const end = agents.indexOf('-->', state.endIndex) + 3;
      findings.push(...checkBudget({ path: 'managed AGENTS block', text: agents.slice(state.startIndex, end) }, BUDGETS));
    }
  };
  checkAgentBudget(resolveInside(manifestRoot, 'AGENTS.md'));
  for (const project of manifest.projects.filter(({ access }) => access === 'managed')) {
    const repository = resolveInside(workspaceRoot, project.localPath);
    if (!repository || !isDirectory(repository)) continue;
    checkAgentBudget(resolveInside(repository, 'AGENTS.md'));
  }
  return findings;
}
