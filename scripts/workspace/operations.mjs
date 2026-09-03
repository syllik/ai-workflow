import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkBudget, BUDGETS } from './budgets.mjs';
import { DEFAULT_MANIFEST_PATH, loadManifest, validateManifest } from './manifest.mjs';
import { markerState, renderAgentsBlock, renderContextScaffold, renderDecisionsScaffold, renderProjectIndex, replaceManagedBlock } from './render.mjs';

export const OPERATION_KINDS = Object.freeze(['clone', 'create-file', 'replace-managed-block']);

function finding(code, filePath, details = {}) {
  return { code, path: filePath, ...details };
}

function normalizeText(text) {
  return `${String(text).replaceAll('\r\n', '\n').replaceAll('\r', '\n').replace(/\n+$/u, '')}\n`;
}

function fingerprint(filePath) {
  if (!existsSync(filePath) || !lstatSync(filePath).isFile()) return null;
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function resolveInside(root, relativePath) {
  const base = path.resolve(root);
  const target = path.resolve(base, relativePath);
  const relative = path.relative(base, target);
  if (relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) return target;
  return null;
}

function command(directory, args) {
  try {
    return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
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

function repositorySafety(destination, repository, localPath, findings, expectedOrigin = expectedRemote(repository), allowedUntrackedPaths = []) {
  const gitPath = path.join(destination, '.git');
  if (!existsSync(gitPath)) {
    findings.push(finding('DESTINATION_COLLISION', localPath));
    return false;
  }
  if (lstatSync(gitPath).isFile()) {
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
  const unexpectedStatusPaths = statusPaths.filter((statusPath) => !lineIsUntracked(statusPath, status, allowedUntrackedPaths));
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

function lineIsUntracked(statusPath, status, allowedUntrackedPaths) {
  const line = status.split('\n').find((candidate) => candidate.slice(3).trim() === statusPath);
  return line?.startsWith('?? ') && allowedUntrackedPaths.includes(statusPath);
}

function allowedUntrackedPaths(project) {
  if (project.access !== 'managed') return [];
  return ['AGENTS.md', project.contextPath, '.ai/decisions.md'];
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
  const root = path.resolve(options.root ?? process.cwd());
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
  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
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
    const safeRepository = repositorySafety(destination, project.repository, project.localPath, findings, resolveExpectedRemote(project.repository, options), allowedUntrackedPaths(project));
    if (!safeRepository) continue;
    if (project.access === 'managed') {
      const repository = { repositoryPath: project.localPath, repository: project.repository };
      addManagedFileOperation(root, operations, findings, path.posix.join(project.localPath, 'AGENTS.md'), 'agents-routing', renderAgentsBlock(manifest), repository);
      addContextOperation(root, operations, findings, project);
      addDecisionsOperation(root, operations, findings, project);
    }
  }

  const blockedCodes = new Set(['DESTINATION_COLLISION', 'WORKTREE_COLLISION', 'GIT_ROOT_MISMATCH', 'ORIGIN_MISMATCH', 'DIRTY_REPOSITORY', 'MULTI_WORKTREE', 'DUPLICATE_MARKER', 'MALFORMED_MARKER', 'UNSAFE_PATH', 'BUDGET_EXCEEDED']);
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
  if (operation.repositoryPath && existsSync(resolveInside(root, operation.repositoryPath))) {
    const repositoryDestination = resolveInside(root, operation.repositoryPath);
    const repositoryRelativePath = path.posix.relative(operation.repositoryPath, operation.path);
    const allowed = ['AGENTS.md', '.ai/decisions.md'];
    if (repositoryRelativePath.endsWith('.ai/context.md')) allowed.push(repositoryRelativePath);
    repositorySafety(repositoryDestination, operation.repository, operation.repositoryPath, findings, resolveExpectedRemote(operation.repository, options), allowed);
  }
}

export function applyOperations(options = {}) {
  const plan = options.plan;
  const root = path.resolve(options.root ?? plan?.root ?? process.cwd());
  const findings = [];
  if (!plan || !Array.isArray(plan.operations)) return { root, applied: [], findings: [finding('INVALID_PLAN', 'plan')], blocked: true };
  if (!existsSync(root) || !lstatSync(root).isDirectory()) return { root, applied: [], findings: [finding('ROOT_NOT_DIRECTORY', root)], blocked: true };
  for (const operation of plan.operations) preflightOperation(root, operation, { ...plan, fingerprints: options.expectedFingerprints ?? plan.fingerprints }, findings, options);
  if (findings.length > 0) return { root, applied: [], findings, blocked: true };

  const applied = [];
  try {
    for (const operation of plan.operations) {
      const destination = path.resolve(operation.destination);
      if (operation.kind === 'clone') {
        mkdirSync(path.dirname(destination), { recursive: true });
        execFileSync('git', ['clone', '--quiet', operation.source ?? resolveExpectedRemote(operation.repository, options), destination], { stdio: 'pipe' });
      } else {
        mkdirSync(path.dirname(destination), { recursive: true });
        writeFileSync(destination, normalizeText(operation.content), 'utf8');
      }
      applied.push(operation.path);
    }
  } catch (error) {
    findings.push(finding('APPLY_FAILED', applied.length < plan.operations.length ? plan.operations[applied.length]?.path ?? 'operation' : 'operation', { message: error.message }));
    return { root, applied, findings, blocked: true };
  }
  return { root, applied, findings, blocked: false };
}

function walkFiles(directory, relative = '') {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    if (relative === '' && entry.name === 'projects') continue;
    const entryRelative = path.posix.join(relative, entry.name);
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walkFiles(entryPath, entryRelative));
    else if (entry.isFile() && entry.name !== 'plan.md') output.push({ path: entryRelative, text: readFileSync(entryPath, 'utf8') });
  }
  return output;
}

export function checkGeneratedFiles(root, manifest, manifestPath = DEFAULT_MANIFEST_PATH) {
  const findings = [];
  const indexPath = path.join(path.dirname(path.resolve(manifestPath)), 'projects/index.md');
  if (!existsSync(indexPath) || readFileSync(indexPath, 'utf8') !== renderProjectIndex(manifest)) findings.push(finding('GENERATED_DRIFT', 'projects/index.md'));
  for (const project of manifest.projects.filter(({ access }) => access === 'managed')) {
    const repository = resolveInside(root, project.localPath);
    if (!repository || !existsSync(repository) || !lstatSync(repository).isDirectory()) continue;
    const agentsPath = path.join(repository, 'AGENTS.md');
    const desiredAgents = renderAgentsBlock(manifest);
    if (!existsSync(agentsPath) || !lstatSync(agentsPath).isFile()) findings.push(finding('GENERATED_DRIFT', path.posix.join(project.localPath, 'AGENTS.md')));
    else {
      const current = readFileSync(agentsPath, 'utf8');
      const state = markerState(current, 'agents-routing');
      if (state.kind !== 'valid' || replaceManagedBlock(current, 'agents-routing', desiredAgents) !== normalizeText(current)) findings.push(finding('GENERATED_DRIFT', path.posix.join(project.localPath, 'AGENTS.md')));
    }
    const contextPath = resolveInside(repository, project.contextPath);
    if (!contextPath || !existsSync(contextPath) || !lstatSync(contextPath).isFile()) {
      findings.push(finding('GENERATED_DRIFT', path.posix.join(project.localPath, project.contextPath)));
    }
    const decisionsPath = path.join(repository, '.ai/decisions.md');
    if (!existsSync(decisionsPath) || !lstatSync(decisionsPath).isFile()) findings.push(finding('GENERATED_DRIFT', path.posix.join(project.localPath, '.ai/decisions.md')));
  }
  const budgetEntries = walkFiles(root).filter(({ path: filePath }) => filePath === 'AI.md' || filePath === 'FLOW.md' || filePath.startsWith('global/') || filePath.endsWith('/.ai/context.md') || filePath.endsWith('/decisions.md') || filePath.endsWith('/prompt.md') || filePath.endsWith('/state.md') || filePath.endsWith('/result.md'));
  findings.push(...budgetEntries.flatMap((entry) => checkBudget(entry, BUDGETS)));
  for (const project of manifest.projects.filter(({ access }) => access === 'managed')) {
    const repository = resolveInside(root, project.localPath);
    if (!repository || !existsSync(repository) || !lstatSync(repository).isDirectory()) continue;
    const agentsPath = path.join(repository, 'AGENTS.md');
    if (!existsSync(agentsPath) || !lstatSync(agentsPath).isFile()) continue;
    const agents = readFileSync(agentsPath, 'utf8');
    const state = markerState(agents, 'agents-routing');
    if (state.kind === 'valid') {
      const end = agents.indexOf('-->', state.endIndex) + 3;
      findings.push(...checkBudget({ path: 'managed AGENTS block', text: agents.slice(state.startIndex, end) }, BUDGETS));
    }
  }
  return findings;
}
