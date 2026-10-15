// This repository owns workspace routing; the shared ChipIn repo owns Issue admission.
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify, TextDecoder } from 'node:util';
import { parse } from 'yaml';
import { validateManifest } from './manifest.mjs';

const execFile = promisify(execFileCallback);
const MASTER = '/repos/syllik/ai-workflow/branches/master';
const CONTENT = '/repos/syllik/ai-workflow/contents/workspace.yaml';
const SHA40 = /^[a-f0-9]{40}$/u;
const BASE64 = /^[a-zA-Z0-9+/]*={0,2}$/u;

function blocked(code) {
  return Object.assign(new Error(code), { code });
}

function normalizeError(cause) {
  if (['PERMISSION_DENIED', 'AUTH_UNAVAILABLE', 'WORKSPACE_UNAVAILABLE'].includes(cause?.code)) return cause;
  const message = String(cause?.stderr ?? '');
  if (/HTTP (?:401|403)/u.test(message) || [401, 403].includes(cause?.status)) return blocked('PERMISSION_DENIED');
  if (cause?.code === 'ENOENT') return blocked('AUTH_UNAVAILABLE');
  return blocked('WORKSPACE_UNAVAILABLE');
}

/** Only two immutable REST paths; an existing credential or gh session is required. */
async function read(endpoint, { env, run, fetchImpl }) {
  if (env.GITHUB_TOKEN) {
    try {
      const response = await fetchImpl('https://api.github.com' + endpoint, {
        method: 'GET', headers: {
          accept: 'application/vnd.github+json',
          authorization: 'Bearer ' + env.GITHUB_TOKEN
        }, signal: AbortSignal.timeout(20_000)
      });
      if (!response.ok) throw Object.assign(new Error('denied'), { status: response.status });
      return await response.json();
    } catch (cause) { throw normalizeError(cause); }
  }
  try {
    const { stdout } = await run('gh', ['api', endpoint, '--method', 'GET', '--hostname', 'github.com'], {
      env: { ...env, GH_HOST: 'github.com' }, timeout: 20_000, maxBuffer: 1_048_576, encoding: 'utf8'
    });
    return JSON.parse(stdout);
  } catch (cause) { throw normalizeError(cause); }
}

export async function loadCanonicalChipInWorkspace({ env = process.env, run = execFile, fetchImpl = fetch } = {}) {
  const context = { env, run, fetchImpl };
  // Never use the caller's cwd, --manifest, task branch or a local YAML file as authority.
  const branch = await read(MASTER, context);
  const sha = branch?.name === 'master' ? branch?.commit?.sha : null;
  if (!SHA40.test(sha ?? '')) throw blocked('WORKSPACE_UNAVAILABLE');

  const file = await read(CONTENT + '?ref=' + sha, context);
  if (file?.name !== 'workspace.yaml' || file.path !== 'workspace.yaml' ||
      file.encoding !== 'base64' || !SHA40.test(file.sha ?? '') ||
      typeof file.content !== 'string' || file.content.length > 262_144) {
    throw blocked('WORKSPACE_UNAVAILABLE');
  }
  const encoded = file.content.replace(/\s/gu, '');
  if (!BASE64.test(encoded) || encoded.length % 4 !== 0) throw blocked('WORKSPACE_UNAVAILABLE');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0 || bytes.length > 65_536 || file.size !== bytes.length ||
      bytes.toString('base64') !== encoded ||
      createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex') !== file.sha) {
    throw blocked('WORKSPACE_UNAVAILABLE');
  }

  let manifest;
  try {
    manifest = parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { throw blocked('WORKSPACE_UNAVAILABLE'); }
  if (!validateManifest(manifest).valid) throw blocked('WORKSPACE_UNAVAILABLE');

  // A branch advance during this read cannot silently change the authoritative routing.
  const confirm = await read(MASTER, context);
  if (confirm?.name !== 'master' || confirm?.commit?.sha !== sha) throw blocked('WORKSPACE_UNAVAILABLE');
  return { manifest, policySourceSha: sha };
}
