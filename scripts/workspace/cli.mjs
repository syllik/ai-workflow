#!/usr/bin/env node

import path from 'node:path';
import { DEFAULT_MANIFEST_PATH, loadManifest, validateManifest } from './manifest.mjs';
import { applyOperations, checkGeneratedFiles, planWorkspace } from './operations.mjs';

const USAGE = 'Usage: node scripts/workspace/cli.mjs check [--root <path>] [--manifest <path>] [--manifest-only] | plan --root <path> [--manifest <path>] | apply --root <path> [--manifest <path>]';

function parseArgs(args) {
  const command = args[0];
  if (!['check', 'plan', 'apply'].includes(command)) throw new Error(USAGE);
  let root;
  let manifestPath;
  let manifestOnly = false;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--root') {
      if (root !== undefined || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(USAGE);
      root = args[++index];
    } else if (arg === '--manifest') {
      if (manifestPath !== undefined || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(USAGE);
      manifestPath = args[++index];
    } else if (arg === '--manifest-only' && command === 'check' && !manifestOnly) {
      manifestOnly = true;
    } else {
      throw new Error(USAGE);
    }
  }
  if (command !== 'check' && root === undefined) throw new Error(USAGE);
  if (command !== 'check' && manifestOnly) throw new Error(USAGE);
  return {
    command,
    root: root === undefined ? process.cwd() : path.resolve(root),
    manifestPath: path.resolve(manifestPath ?? DEFAULT_MANIFEST_PATH),
    manifestOnly
  };
}

function printFindings(findings) {
  if (findings.length > 0) process.stderr.write(`${JSON.stringify(findings)}\n`);
}

function run(args) {
  let options;
  try {
    options = parseArgs(args);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
  let manifest;
  try {
    manifest = loadManifest(options.manifestPath);
  } catch {
    printFindings([{ code: 'MANIFEST_UNREADABLE', path: options.manifestPath }]);
    return options.command === 'apply' ? 2 : 1;
  }
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    printFindings(validation.findings);
    return 1;
  }
  if (options.command === 'check') {
    if (options.manifestOnly) return 0;
    let findings;
    try {
      findings = checkGeneratedFiles(options.root, manifest, options.manifestPath);
    } catch (error) {
      printFindings([{ code: 'CHECK_FAILED', path: options.root, message: error.message }]);
      return 2;
    }
    printFindings(findings);
    return findings.length > 0 ? 1 : 0;
  }

  const plan = planWorkspace({ root: options.root, manifestPath: options.manifestPath, manifest });
  printFindings(plan.findings);
  if (plan.validationFailed) return 1;
  if (plan.blocked) return 2;
  if (options.command === 'plan') return plan.operations.length > 0 || plan.drift ? 1 : 0;
  if (plan.drift) return 1;
  const applied = applyOperations({ root: options.root, plan });
  printFindings(applied.findings);
  return applied.blocked ? 2 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = run(process.argv.slice(2));

export { parseArgs, run };
