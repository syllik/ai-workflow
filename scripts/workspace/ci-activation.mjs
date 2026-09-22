#!/usr/bin/env node

import path from 'node:path';
import { DEFAULT_MANIFEST_PATH } from './manifest.mjs';
import { run } from './cli.mjs';

const baseRef = process.env.WORKSPACE_ACTIVATION_BASE_SHA;
if (baseRef && !/^0+$/u.test(baseRef)) {
  process.exitCode = run([
    'check',
    '--root',
    process.cwd(),
    '--manifest',
    path.resolve(DEFAULT_MANIFEST_PATH),
    '--activation-base',
    baseRef
  ]);
}
