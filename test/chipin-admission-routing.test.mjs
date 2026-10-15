import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveChipInAdmissionRoute as route } from '../scripts/workspace/chipin-admission-route.mjs';

const SHA = '6'.repeat(40);
const REV = 'a'.repeat(64);
const records = [
  ['ChipIn-one/chipin-frontend', 'dev', 'managed'],
  ['ChipIn-one/chipin-backend', 'develop', 'read-only'],
  ['ChipIn-one/chipin-knowledge-base', 'master', 'read-only']
];
const manifest = {
  projects: records.map(([repository, integrationBranch, access]) => ({ repository, integrationBranch, access, status: 'active' })),
  gitLifecycle: { repositories: records.map(([repository, integrationBranch]) => ({ repository, integrationBranch })) }
};
const authenticatedGitHubRead = {
  request: async (path, options) => {
    assert.equal(path, '/repos/ChipIn-one/.github/branches/master');
    assert.deepEqual(options, { method: 'GET' });
    return { name: 'master', commit: { sha: SHA } };
  }
};
const config = (override = {}) => ({
  manifest, issue: 'ChipIn-one/chipin-frontend#153', sharedSourceSha: SHA, authenticatedGitHubRead, ...override
});

const blocked = (value, code) => {
  assert.equal(value.status, 'BLOCKED');
  assert.equal(value.diagnostic.code, code);
  assert.ok(value.diagnostic.remedy);
};

describe('shared ChipIn preflight routing (not admission)', () => {
  test('missing shell token does not block an authenticated gh session', async () => {
    const result = await route(config({ expectedRevision: REV, capabilities: { authenticatedGh: true } }));
    assert.equal(result.status, 'PENDING_VERIFICATION');
    assert.equal(result.transport, 'authenticated-gh');
    assert.equal(result.entrypoint, 'automation/issue-admission-preflight.mjs');
    assert.deepEqual(result.args, ['--issue', 'ChipIn-one/chipin-frontend#153', '--expected-revision', REV]);
    assert.equal(result.integrationBranch, 'dev');
    assert.equal(result.shared.repository, 'ChipIn-one/.github');
    assert.equal(result.shared.sourceSha, SHA);
    assert.equal(Object.hasOwn(result, 'authorized'), false);
  });

  test('explicit approved credential takes priority without extracting gh credentials', async () => {
    const r = await route(config({ capabilities: { approvedCredential: true, authenticatedGh: true } }));
    assert.equal(r.transport, 'approved-credential');
    assert.equal(JSON.stringify(r).includes('token'), false);
  });

  test('uses only the exact declared workspace record and integration branch', async () => {
    const be = await route(config({ issue: 'ChipIn-one/chipin-backend#178', capabilities: { authenticatedGh: true } }));
    assert.equal(be.integrationBranch, 'develop');
    assert.equal(be.repository, 'ChipIn-one/chipin-backend');
    const kb = await route(config({ issue: 'ChipIn-one/chipin-knowledge-base#9', selectedOwner: 'syllik', capabilities: { authenticatedGh: true } }));
    assert.equal(kb.integrationBranch, 'master');
    assert.deepEqual(kb.args.slice(0,4), ['--issue', 'ChipIn-one/chipin-knowledge-base#9', '--owner', 'syllik']);
  });

  test('connector-only requires authorized delivery, authenticated read and durable replay', async () => {
    const all = { authorizedEvidenceDelivery: true, authenticatedArtifactRead: true, durableReplayRegistry: true };
    const result = await route(config({ expectedRevision: REV, capabilities: all }));
    assert.equal(result.status, 'PENDING_VERIFICATION');
    assert.equal(result.entrypoint, 'automation/issue-admission-consumer.mjs');
    assert.equal(result.verification, 'consumeAdmissionArtifact');
    assert.deepEqual(result.requiredBinding, { issue: 'ChipIn-one/chipin-frontend#153', revision: REV, originalReceiptMaxAgeSeconds: 120 });
    for (const missing of Object.keys(all)) blocked(await route(config({ capabilities: { ...all, [missing]: false } })), 'AUTH_UNAVAILABLE');
  });

  test('without authorized routes fails closed, not with PAT prompt or raw Issue GET fallback', async () => {
    const result = await route(config({ capabilities: { rawIssueGet: true, ghBinaryInstalled: true, copiedJson: true, greenCheck: true } }));
    blocked(result, 'AUTH_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(result), /create a PAT|issue-intake\.mjs|repository_dispatch/u);
  });

  test('rejects wrong Issue identities, missing workspace and implicit auto-discovery', async () => {
    for (const issue of ['ChipIn-one/chipin-frontend', 'syllik/ai-workflow#57', 'ChipIn-one/unknown#1', 'ChipIn-one/chipin-frontend#0']) {
      blocked(await route(config({ issue })), 'INVALID_ISSUE');
    }
    blocked(await route(config({ manifest: { projects: [], gitLifecycle: { repositories: [] } } })), 'WORKSPACE_UNAVAILABLE');
    blocked(await route(config({ manifest: { ...manifest, projects: [...manifest.projects, manifest.projects[0]] } })), 'WORKSPACE_UNAVAILABLE');
  });

  test('rejects stale or missing shared source and invalid canonical revision', async () => {
    blocked(await route(config({ sharedSourceSha: undefined })), 'UNTRUSTED_SOURCE');
    for (const expectedRevision of ['', 'not-a-revision', 'a'.repeat(40)]) {
      blocked(await route(config({ expectedRevision })), 'INVALID_REVISION');
    }
  });

  test('rejects inconsistent integrationBranch and unknown KB owner', async () => {
    const other = structuredClone(manifest);
    other.gitLifecycle.repositories[0].integrationBranch = 'main';
    blocked(await route(config({ manifest: other })), 'BRANCH_MISMATCH');
    blocked(await route(config({ issue: 'ChipIn-one/chipin-knowledge-base#1' })), 'OWNER_REQUIRED');
  });

  test('rejects unverified, stale or changed shared master refs without falling back', async () => {
    const current = { name: 'master', commit: { sha: SHA } };
    let hits = 0;
    const authenticatedGitHubRead = { request: async (path, options) => {
      hits += 1;
      assert.equal(path, '/repos/ChipIn-one/.github/branches/master');
      assert.deepEqual(options, { method: 'GET' });
      return current;
    } };
    blocked(await route(config({ sharedSourceSha: 'b'.repeat(40), authenticatedGitHubRead })), 'STALE_TRUSTED_SOURCE');
    blocked(await route(config({ authenticatedGitHubRead: null })), 'AUTH_UNAVAILABLE');
    blocked(await route(config({ authenticatedGitHubRead: { request: async () => ({ name: 'other', commit: { sha: SHA } }) } })), 'SHARED_REF_UNREADABLE');
    blocked(await route(config({ authenticatedGitHubRead: { request: async () => ({ name: 'master', commit: { sha: '0'.repeat(40) } }) } })), 'STALE_TRUSTED_SOURCE');
    blocked(await route(config({ authenticatedGitHubRead: { request: async () => { throw Object.assign(new Error('redacted'), { code: 'PERMISSION_DENIED' }); } } })), 'PERMISSION_DENIED');
    assert.equal(hits, 1);
  });

  test('rejects frontend/backend selectedOwner overrides; only KB forwards owner', async () => {
    for (const issue of ['ChipIn-one/chipin-frontend#153', 'ChipIn-one/chipin-backend#178']) {
      for (const selectedOwner of ['syllik', 'olegbal', 'other', '']) {
        blocked(await route(config({ issue, selectedOwner, capabilities: { authenticatedGh: true } })), 'OWNER_OVERRIDE_FORBIDDEN');
      }
    }
    const kb = await route(config({ issue: 'ChipIn-one/chipin-knowledge-base#4', selectedOwner: 'syllik', capabilities: { authenticatedGh: true } }));
    assert.deepEqual(kb.args.slice(0, 4), ['--issue', 'ChipIn-one/chipin-knowledge-base#4', '--owner', 'syllik']);
  });

  test('connector-only route refuses missing revision even with a verified delivery channel', async () => {
    const capabilities = { authorizedEvidenceDelivery: true, authenticatedArtifactRead: true, durableReplayRegistry: true };
    blocked(await route(config({ expectedRevision: null, capabilities })), 'INVALID_REVISION');
    blocked(await route(config({ expectedRevision: undefined, capabilities })), 'INVALID_REVISION');
    blocked(await route(config({ expectedRevision: 'e'.repeat(40), capabilities })), 'INVALID_REVISION');
    const valid = await route(config({ expectedRevision: REV, capabilities }));
    assert.equal(valid.status, 'PENDING_VERIFICATION');
    assert.equal(valid.requiredBinding.revision, REV);
  });

  test('never promotes raw copied receipt or verified-looking metadata to admission', async () => {
    const suspicious = {
      status: 'INTAKE_COMPLETE', revision: REV, checkedAt: new Date().toISOString(),
      artifactDigest: 'sha256:fake', project: { number: 5, status: 'Todo' }
    };
    const result = await route(config({ receipt: suspicious, evidence: suspicious, capabilities: { authenticatedGh: true } }));
    assert.equal(result.status, 'PENDING_VERIFICATION');
    assert.equal(Object.hasOwn(result, 'receipt'), false);
    assert.equal(Object.hasOwn(result, 'approved'), false);
  });
});
