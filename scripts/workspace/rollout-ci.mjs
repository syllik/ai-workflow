import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadManifest } from './manifest.mjs';
import { evaluatePilotRollout, immutableSha, loadRolloutPolicy, resolveRolloutProjects, routingBlockSha256, validateRolloutPolicy } from './rollout.mjs';

const TOKEN_ENV_BY_REPOSITORY = Object.freeze({
  'syllik/syllik': 'WORKSPACE_READ_TOKEN_SYLLIK',
  'ChipIn-one/.github': 'WORKSPACE_READ_TOKEN_CHIPIN'
});

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  }).trim();
}

function sourceResult(manifest, policy, policySha) {
  const findings = validateRolloutPolicy(policy, manifest);
  const exactPolicySha = immutableSha(policySha);
  if (!exactPolicySha) findings.push({ code: 'POLICY_SHA_INVALID', path: 'policy.sha' });
  let headSha = null;
  try {
    headSha = immutableSha(git(['rev-parse', 'HEAD']));
  } catch {
    findings.push({ code: 'POLICY_HEAD_UNAVAILABLE', path: 'git.HEAD' });
  }
  if (exactPolicySha && headSha !== exactPolicySha) {
    findings.push({ code: 'POLICY_HEAD_SHA_MISMATCH', path: 'git.HEAD', expected: exactPolicySha, actual: headSha });
  }
  return {
    passed: findings.length === 0,
    receipt: {
      stage: 'source-validation',
      policySha: exactPolicySha,
      policyBlockSha256: routingBlockSha256(manifest),
      targets: policy.targets ?? [],
      outcome: findings.length === 0 ? 'complete' : 'incomplete',
      ...(findings.length > 0 ? { findings } : {})
    }
  };
}

function authEnvironment(token) {
  return {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}`
  };
}

function materializeTargetFactory(root) {
  return (project) => {
    const tokenEnv = TOKEN_ENV_BY_REPOSITORY[project.repository];
    const token = tokenEnv ? process.env[tokenEnv] : null;
    if (!token) return { repositoryRoot: null, targetSha: null, reason: 'TARGET_PRIVATE_UNAVAILABLE' };

    const remote = `https://github.com/${project.repository}.git`;
    const branchRef = `refs/heads/${project.integrationBranch}`;
    const env = authEnvironment(token);
    let targetSha;
    try {
      const remoteLine = git(['ls-remote', remote, branchRef], { env });
      targetSha = immutableSha(remoteLine.split(/\s+/u)[0]);
    } catch {
      return { repositoryRoot: null, targetSha: null, reason: 'TARGET_PRIVATE_UNAVAILABLE' };
    }
    if (!targetSha) return { repositoryRoot: null, targetSha: null, reason: 'TARGET_SHA_UNRESOLVED' };

    const destination = path.join(root, project.repository.replaceAll('/', '__'));
    mkdirSync(path.dirname(destination), { recursive: true });
    try {
      git([
        'clone', '--quiet', '--no-tags', '--single-branch', '--branch', project.integrationBranch,
        '--no-checkout', remote, destination
      ], { env });
      git(['-C', destination, 'checkout', '--quiet', '--detach', targetSha], { env });
    } catch {
      return { repositoryRoot: null, targetSha, reason: 'TARGET_PRIVATE_UNAVAILABLE' };
    }
    return { repositoryRoot: destination, targetSha };
  };
}

function writeReceipts(result) {
  const outputPath = path.resolve('rollout-receipts.json');
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result)}\n`);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const rows = result.receipts.map((receipt) => `| ${receipt.repository} | ${receipt.integrationBranch} | ${receipt.policySha ?? '—'} | ${receipt.targetSha ?? '—'} | ${receipt.outcome} | ${receipt.reason ?? '—'} |`);
    const markdown = [
      '## Routing rollout receipts',
      '',
      '| Repository | Branch | Policy SHA | Target SHA | Outcome | Reason |',
      '| --- | --- | --- | --- | --- | --- |',
      ...rows,
      ''
    ].join('\n');
    writeFileSync(summaryPath, markdown, { encoding: 'utf8', flag: 'a' });
  }
}

const mode = process.argv[2] ?? 'source';
const manifest = loadManifest('workspace.yaml');
const policy = loadRolloutPolicy();
let policySha = process.env.WORKSPACE_POLICY_SHA;
if (!policySha) {
  try {
    policySha = git(['rev-parse', 'HEAD']);
  } catch {
    policySha = null;
  }
}

const source = sourceResult(manifest, policy, policySha);
if (mode === 'source') {
  process.stdout.write(`${JSON.stringify(source.receipt)}\n`);
  if (!source.passed) process.exitCode = 1;
} else if (mode === 'targets') {
  if (!source.passed) {
    writeReceipts({ passed: false, findings: source.receipt.findings ?? [], receipts: [] });
    process.exitCode = 1;
  } else {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ai-workflow-rollout-'));
    try {
      const projects = resolveRolloutProjects(policy, manifest);
      for (const project of projects) {
        if (!TOKEN_ENV_BY_REPOSITORY[project.repository]) throw new Error(`No credential route for ${project.repository}`);
      }
      const result = evaluatePilotRollout({
        manifest,
        policy,
        policySha,
        materializeTarget: materializeTargetFactory(tempRoot)
      });
      writeReceipts(result);
      if (!result.passed) process.exitCode = 1;
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
} else {
  process.stderr.write(`Unknown rollout mode: ${mode}\n`);
  process.exitCode = 2;
}
