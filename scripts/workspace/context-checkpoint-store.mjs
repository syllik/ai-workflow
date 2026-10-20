import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { open, lstat, mkdir, readdir, readFile, rename, unlink, link } from 'node:fs/promises';
import path from 'node:path';
import { signContextCheckpoint, verifyContextCheckpoint } from './context-policy.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const SECRET_MINIMUM_LENGTH = 32;

function finding(code, pathName, details = {}) {
  return { code, path: pathName, ...details };
}

function checkpointKey(checkpointId) {
  return createHash('sha256').update(checkpointId, 'utf8').digest('hex');
}

function validSequence(sequence) {
  return Number.isSafeInteger(sequence) && sequence >= 0;
}

function validId(checkpointId) {
  return typeof checkpointId === 'string' && SAFE_ID.test(checkpointId);
}

function ownerIsCurrent(stat) {
  return typeof process.getuid !== 'function' || stat.uid === process.getuid();
}

async function privateDirectory(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) {
    return [finding('CHECKPOINT_STORAGE_UNSAFE', 'directory')];
  }
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || !ownerIsCurrent(info)) {
      return [finding('CHECKPOINT_STORAGE_UNSAFE', 'directory')];
    }
    return [];
  } catch {
    return [finding('CHECKPOINT_STORAGE_UNAVAILABLE', 'directory')];
  }
}

async function secretFrom(provider) {
  if (typeof provider !== 'function') return null;
  try {
    const secret = await provider();
    return typeof secret === 'string' && secret.length >= SECRET_MINIMUM_LENGTH ? secret : null;
  } catch {
    return null;
  }
}

async function syncDirectory(directory) {
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function listRecords(directory, key) {
  const prefix = `${key}.`;
  const entries = await readdir(directory);
  const records = [];
  for (const entry of entries) {
    if (!entry.startsWith(prefix) || !entry.endsWith('.json')) continue;
    const sequenceText = entry.slice(prefix.length, -'.json'.length);
    if (!/^\d+$/u.test(sequenceText)) continue;
    const sequence = Number(sequenceText);
    if (!validSequence(sequence)) return { error: [finding('INVALID_CHECKPOINT_SEQUENCE', `records.${entry}`)] };
    const filePath = path.join(directory, entry);
    const info = await lstat(filePath);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || !ownerIsCurrent(info)) {
      return { error: [finding('CHECKPOINT_STORAGE_UNSAFE', `records.${entry}`)] };
    }
    records.push({ entry, filePath, sequence });
  }
  records.sort((left, right) => right.sequence - left.sequence);
  return { records };
}

function storageFailure(findings) {
  return { valid: false, findings };
}

const DEFAULT_STALE_LOCK_MS = 10 * 60 * 1000;

function headMac(secret, checkpointId, sequence) {
  return createHmac('sha256', secret).update(`checkpoint-head:v1:${checkpointId}:${sequence}`).digest('hex');
}

// Authenticated high-water mark: deleting newer records cannot roll a checkpoint back.
async function readHead(root, key, checkpointId, secret) {
  let raw;
  try {
    raw = await readFile(path.join(root, `${key}.head`), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { head: null };
    return { error: [finding('CHECKPOINT_STORAGE_UNAVAILABLE', 'head')] };
  }
  try {
    const head = JSON.parse(raw);
    const expected = headMac(secret, checkpointId, head?.sequence);
    if (head?.checkpointId !== checkpointId || !validSequence(head?.sequence) || typeof head?.mac !== 'string' || !SHA256.test(head.mac)
      || !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(head.mac, 'hex'))) {
      return { error: [finding('CHECKPOINT_HEAD_INVALID', 'head')] };
    }
    return { head };
  } catch {
    return { error: [finding('CHECKPOINT_HEAD_INVALID', 'head')] };
  }
}

async function writeHead(root, key, checkpointId, sequence, secret) {
  const tempPath = path.join(root, `.${key}.head.${randomUUID()}.tmp`);
  const handle = await open(tempPath, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify({ checkpointId, sequence, mac: headMac(secret, checkpointId, sequence) })}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tempPath, path.join(root, `${key}.head`));
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

// A lock left by a crashed writer is reclaimed only when its owner is gone or it is stale.
async function acquireLock(lockPath, staleLockMs) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx', 0o600);
      await handle.writeFile(`${process.pid}:${Date.now()}`, 'utf8');
      return { handle };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let owner = '';
      try { owner = await readFile(lockPath, 'utf8'); } catch { owner = ''; }
      const [pidText, sinceText] = owner.split(':');
      const pid = Number(pidText);
      const since = Number(sinceText);
      const abandoned = (Number.isSafeInteger(pid) && pid > 0 && !processAlive(pid))
        || (Number.isFinite(since) && Date.now() - since > staleLockMs);
      if (attempt > 0 || !abandoned) return { locked: true };
      await unlink(lockPath).catch(() => {});
    }
  }
  return { locked: true };
}

export function createContextCheckpointStore({ directory, secretProvider, staleLockMs = DEFAULT_STALE_LOCK_MS } = {}) {
  const root = typeof directory === 'string' ? path.resolve(directory) : directory;

  async function save(checkpointId, payload, { sequence } = {}) {
    if (!validId(checkpointId)) return storageFailure([finding('INVALID_CHECKPOINT_ID', 'checkpointId')]);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return storageFailure([finding('INVALID_CHECKPOINT_PAYLOAD', 'payload')]);
    if (!validSequence(sequence)) return storageFailure([finding('INVALID_CHECKPOINT_SEQUENCE', 'sequence')]);
    const directoryFindings = await privateDirectory(root);
    if (directoryFindings.length > 0) return storageFailure(directoryFindings);
    const secret = await secretFrom(secretProvider);
    if (secret === null) return storageFailure([finding('CHECKPOINT_SECRET_UNAVAILABLE', 'secretProvider')]);

    const key = checkpointKey(checkpointId);
    const lockPath = path.join(root, `${key}.lock`);
    let lockHandle;
    try {
      const lock = await acquireLock(lockPath, staleLockMs);
      if (lock.locked) return storageFailure([finding('CHECKPOINT_LOCKED', 'checkpointId')]);
      lockHandle = lock.handle;
      const listed = await listRecords(root, key);
      if (listed.error) return storageFailure(listed.error);
      const headState = await readHead(root, key, checkpointId, secret);
      if (headState.error) return storageFailure(headState.error);
      const latestRecord = listed.records[0]?.sequence;
      if ((latestRecord !== undefined) !== (headState.head !== null) || (latestRecord !== undefined && latestRecord !== headState.head.sequence)) {
        return storageFailure([finding('CHECKPOINT_ROLLBACK_DETECTED', 'records')]);
      }
      const latest = headState.head?.sequence;
      if (latest !== undefined && sequence <= latest) return storageFailure([finding('CHECKPOINT_REPLAY', 'sequence', { latestSequence: latest })]);

      const signedPayload = { ...payload, checkpointId, sequence };
      const checkpoint = signContextCheckpoint(signedPayload, secret);
      const serialized = `${JSON.stringify(checkpoint)}\n`;
      const finalPath = path.join(root, `${key}.${sequence}.json`);
      const tempPath = path.join(root, `.${key}.${sequence}.${randomUUID()}.tmp`);
      const tempHandle = await open(tempPath, 'wx', 0o600);
      try {
        await tempHandle.writeFile(serialized, 'utf8');
        await tempHandle.sync();
      } finally {
        await tempHandle.close();
      }
      try {
        await link(tempPath, finalPath);
      } catch (error) {
        if (error?.code === 'EEXIST') return storageFailure([finding('CHECKPOINT_REPLAY', 'sequence', { latestSequence: latest ?? sequence })]);
        throw error;
      } finally {
        await unlink(tempPath).catch(() => {});
      }
      await writeHead(root, key, checkpointId, sequence, secret);
      await syncDirectory(root);
      return { valid: true, checkpoint, sequence, path: finalPath };
    } catch (error) {
      if (error?.code === 'EEXIST') return storageFailure([finding('CHECKPOINT_REPLAY', 'sequence')]);
      return storageFailure([finding('CHECKPOINT_STORAGE_UNAVAILABLE', 'storage')]);
    } finally {
      // Only the save that acquired the lock may release it.
      if (lockHandle) {
        await lockHandle.close().catch(() => {});
        await unlink(lockPath).catch(() => {});
      }
    }
  }

  async function loadLatest(checkpointId, { current } = {}) {
    if (!validId(checkpointId)) return storageFailure([finding('INVALID_CHECKPOINT_ID', 'checkpointId')]);
    const directoryFindings = await privateDirectory(root);
    if (directoryFindings.length > 0) return storageFailure(directoryFindings);
    const secret = await secretFrom(secretProvider);
    if (secret === null) return storageFailure([finding('CHECKPOINT_SECRET_UNAVAILABLE', 'secretProvider')]);
    const key = checkpointKey(checkpointId);
    try {
      const listed = await listRecords(root, key);
      if (listed.error) return storageFailure(listed.error);
      const record = listed.records[0];
      const headState = await readHead(root, key, checkpointId, secret);
      if (headState.error) return storageFailure(headState.error);
      if (!record && headState.head === null) return storageFailure([finding('CHECKPOINT_NOT_FOUND', 'checkpointId')]);
      if (!record || headState.head === null || record.sequence !== headState.head.sequence) {
        return storageFailure([finding('CHECKPOINT_ROLLBACK_DETECTED', 'records')]);
      }
      let checkpoint;
      try {
        const handle = await open(record.filePath, 'r');
        let serialized;
        try {
          serialized = await handle.readFile('utf8');
        } finally {
          await handle.close();
        }
        checkpoint = JSON.parse(serialized);
      } catch {
        return storageFailure([finding('INVALID_CHECKPOINT', `records.${record.entry}`)]);
      }
      if (checkpoint?.payload?.checkpointId !== checkpointId || checkpoint?.payload?.sequence !== record.sequence) {
        return storageFailure([
          finding('INVALID_CHECKPOINT', `records.${record.entry}`),
          finding('CHECKPOINT_IDENTITY_MISMATCH', `records.${record.entry}`)
        ]);
      }
      const verified = verifyContextCheckpoint(checkpoint, secret, current);
      if (!verified.valid) return { valid: false, findings: verified.findings, checkpoint, sequence: record.sequence };
      return { valid: true, findings: [], checkpoint, payload: checkpoint.payload, sequence: record.sequence, path: record.filePath };
    } catch {
      return storageFailure([finding('CHECKPOINT_STORAGE_UNAVAILABLE', 'storage')]);
    }
  }

  return Object.freeze({ save, loadLatest });
}
