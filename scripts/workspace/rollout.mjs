import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { validateManagedTarget } from './operations.mjs';
import { renderAgentsBlock } from './render.mjs';

export const ROLLOUT_POLICY_PATH = 'rollout.yaml';
export const ROLLOUT_PILOT = Object.freeze(['syllik/syllik', 'ChipIn-one/.github']);

const SHA_PATTERN = /^[0-9a-f]{40}$/iu;
const EXPECTED_MODE = 'read-only-verify';
const EXPECTED_AUTH_TYPE = 'github-app-installation';

function finding(code, findingPath, details = {}) {
  return { code, path: findingPath, ...details };
}

function normalizedRepository(repository) {
  return typeof repository === 'string' ? repository.toLowerCase() : repository;
}

function normalizeRemote(value) {
  if (!value) return null;
  let remote = String(value).trim();
  if (remote.startsWith('git@github.com:')) remote = `https://github.com/${remote.slice('git@github.com:'.length)}`;
  remote = remote.replace(/^ssh:\/\/git@github\.com\//u, 'https://github.com/');
  return remote.replace(/\/+$/u, '').replace(/\.git$/u, '').toLowerCase();
}

function git(directory, args, { allowStatusOne = false } = {}) {
  try {
    return execFileSync('git', ['-C', directory, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (error) {
    if (allowStatusOne && error?.status === 1) return null;
    return null;
  }
}

function isDirectory(directoryPath) {
  try {
    return lstatSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
}

export function immutableSha(value) {
  return typeof value === 'string' && SHA_PATTERN.test(value) ? value.toLowerCase() : null;
}

export function loadRolloutPolicy(policyPath = ROLLOUT_POLICY_PATH) {
  return parse(readFileSync(policyPath, 'utf8'));
}

export function validateRolloutPolicy(policy, manifest) {
  const findings = [];
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return [finding('ROLLOUT_POLICY_INVALID', ROLLOUT_POLICY_PATH)];
  }
  if (policy.schemaVersion !== 1) findings.push(finding('ROLLOUT_SCHEMA_UNSUPPORTED', 'rollout.schemaVersion'));
  if (policy.mode !== EXPECTED_MODE) findings.push(finding('ROLLOUT_MODE_INVALID', 'rollout.mode'));
  if (policy.authentication?.type !== EXPECTED_AUTH_TYPE) findings.push(finding('ROLLOUT_AUTH_INVALID', 'rollout.authentication.type'));
  const permissions = policy.authentication?.permissions;
  if (!permissions || Object.keys(permissions).length !== 1 || permissions.contents !== 'read') {
    findings.push(finding('ROLLOUT_AUTH_NOT_LEAST_PRIVILEGE', 'rollout.authentication.permissions'));
  }

  if (!Array.isArray(policy.targets)) {
    findings.push(finding('ROLLOUT_TARGETS_INVALID', 'rollout.targets'));
    return findings;
  }
  const targets = policy.targets;
  if (targets.length !== ROLLOUT_PILOT.length || targets.some((target, index) => target !== ROLLOUT_PILOT[index])) {
    findings.push(finding('ROLLOUT_ALLOWLIST_MISMATCH', 'rollout.targets', { expected: [...ROLLOUT_PILOT], actual: [...targets] }));
  }
  if (new Set(targets).size !== targets.length) findings.push(finding('ROLLOUT_TARGET_DUPLICATE', 'rollout.targets'));

  const projects = new Map((manifest?.projects ?? []).map((project) => [normalizedRepository(project.repository), project]));
  for (const repository of targets) {
    if (!ROLLOUT_PILOT.includes(repository)) {
      findings.push(finding('ROLLOUT_TARGET_NOT_ALLOWED', `rollout.targets.${repository}`));
      continue;
    }
    const project = projects.get(normalizedRepository(repository));
    if (!project) {
      findings.push(finding('ROLLOUT_TARGET_NOT_REGISTERED', `rollout.targets.${repository}`));
      continue;
    }
    if (project.id !== project.repository || project.repository !== repository || project.access !== 'managed' || project.status !== 'active') {
      findings.push(finding('ROLLOUT_TARGET_NOT_ACTIVE_MANAGED', `rollout.targets.${repository}`));
    }
    if (typeof project.integrationBranch !== 'string' || project.integrationBranch.length === 0 || typeof project.contextPath !== 'string') {
      findings.push(finding('ROLLOUT_TARGET_RECORD_INVALID', `rollout.targets.${repository}`));
    }
  }
  return findings;
}

export function resolveRolloutProjects(policy, manifest) {
  const byRepository = new Map(manifest.projects.map((project) => [normalizedRepository(project.repository), project]));
  return policy.targets.map((repository) => byRepository.get(normalizedRepository(repository)));
}

export function routingBlockSha256(manifest) {
  return createHash('sha256').update(renderAgentsBlock(manifest), 'utf8').digest('hex');
}

function incompleteReceipt(project, policySha, blockSha256, reason, targetSha = null, findings = undefined) {
  const receipt = {
    repository: project.repository,
    integrationBranch: project.integrationBranch,
    policySha,
    policyBlockSha256: blockSha256,
    targetSha: immutableSha(targetSha),
    outcome: 'incomplete',
    reason
  };
  if (findings?.length) receipt.findings = findings;
  return receipt;
}

export function inspectMaterializedTarget({ repositoryRoot, project, manifest, policySha, targetSha }) {
  const exactPolicySha = immutableSha(policySha);
  const exactTargetSha = immutableSha(targetSha);
  const blockSha256 = routingBlockSha256(manifest);
  if (!exactPolicySha) return incompleteReceipt(project, policySha ?? null, blockSha256, 'POLICY_SHA_INVALID');
  if (!exactTargetSha) return incompleteReceipt(project, exactPolicySha, blockSha256, 'TARGET_SHA_UNRESOLVED');
  if (!repositoryRoot || !existsSync(repositoryRoot) || !isDirectory(repositoryRoot)) {
    return incompleteReceipt(project, exactPolicySha, blockSha256, 'TARGET_ABSENT', exactTargetSha);
  }

  const findings = [];
  const gitPath = path.join(repositoryRoot, '.git');
  try {
    const stat = lstatSync(gitPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) findings.push(finding('TARGET_GIT_METADATA_UNSAFE', project.localPath));
  } catch {
    findings.push(finding('TARGET_GIT_METADATA_MISSING', project.localPath));
  }

  const expectedRemote = `https://github.com/${project.repository}.git`;
  const origin = git(repositoryRoot, ['config', '--get', 'remote.origin.url']);
  if (normalizeRemote(origin) !== normalizeRemote(expectedRemote)) {
    findings.push(finding('TARGET_ORIGIN_MISMATCH', project.localPath, { expected: expectedRemote, actual: origin || null }));
  }

  const symbolicHead = git(repositoryRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowStatusOne: true });
  if (symbolicHead !== null) findings.push(finding('TARGET_HEAD_NOT_DETACHED', project.localPath, { actual: symbolicHead }));

  const headSha = immutableSha(git(repositoryRoot, ['rev-parse', 'HEAD']));
  if (headSha !== exactTargetSha) findings.push(finding('TARGET_HEAD_SHA_MISMATCH', project.localPath, { expected: exactTargetSha, actual: headSha }));

  const branchSha = immutableSha(git(repositoryRoot, ['rev-parse', '--verify', `refs/heads/${project.integrationBranch}^{commit}`]));
  if (branchSha !== exactTargetSha) {
    findings.push(finding('TARGET_BRANCH_SHA_MISMATCH', project.localPath, { expected: exactTargetSha, actual: branchSha }));
  }

  const worktreeStatus = git(repositoryRoot, ['status', '--porcelain', '--untracked-files=all']);
  if (worktreeStatus === null) findings.push(finding('TARGET_GIT_STATUS_UNAVAILABLE', project.localPath));
  else if (worktreeStatus.length > 0) findings.push(finding('TARGET_WIP', project.localPath));

  if (findings.length === 0) validateManagedTarget(repositoryRoot, project, manifest, findings, { validateTaskArtifacts: true });
  if (findings.length > 0) {
    const stale = findings.some(({ code }) => code === 'GENERATED_DRIFT');
    const wip = findings.some(({ code }) => code === 'TARGET_WIP');
    const reason = stale ? 'TARGET_STALE' : wip ? 'TARGET_WIP' : 'TARGET_UNVERIFIED';
    return incompleteReceipt(project, exactPolicySha, blockSha256, reason, exactTargetSha, findings);
  }

  return {
    repository: project.repository,
    integrationBranch: project.integrationBranch,
    policySha: exactPolicySha,
    policyBlockSha256: blockSha256,
    targetSha: exactTargetSha,
    outcome: 'complete'
  };
}

export function evaluatePilotRollout({ manifest, policy, policySha, materializeTarget }) {
  const policyFindings = validateRolloutPolicy(policy, manifest);
  const exactPolicySha = immutableSha(policySha);
  if (!exactPolicySha) policyFindings.push(finding('POLICY_SHA_INVALID', 'policy.sha'));
  if (policyFindings.length > 0) return { passed: false, findings: policyFindings, receipts: [] };
  if (typeof materializeTarget !== 'function') {
    return { passed: false, findings: [finding('ROLLOUT_MATERIALIZER_MISSING', 'materializeTarget')], receipts: [] };
  }

  const blockSha256 = routingBlockSha256(manifest);
  const projects = resolveRolloutProjects(policy, manifest);
  const receipts = projects.map((project) => {
    let materialized;
    try {
      materialized = materializeTarget(project);
    } catch {
      return incompleteReceipt(project, exactPolicySha, blockSha256, 'TARGET_PRIVATE_UNAVAILABLE');
    }
    if (!materialized?.repositoryRoot) {
      return incompleteReceipt(
        project,
        exactPolicySha,
        blockSha256,
        materialized?.reason ?? 'TARGET_ABSENT',
        materialized?.targetSha ?? null
      );
    }
    return inspectMaterializedTarget({
      repositoryRoot: materialized.repositoryRoot,
      project,
      manifest,
      policySha: exactPolicySha,
      targetSha: materialized.targetSha
    });
  });

  return { passed: receipts.every(({ outcome }) => outcome === 'complete'), findings: [], receipts };
}
