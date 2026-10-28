import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectSnapshot } from './project-snapshot.mjs';

const history = { frameworkVersion: '0.2.0', reviewedOn: '2026-10-28', reference: 'docs/0.2-validation.md', documentSHA256: 'a'.repeat(64), scope: 'Historical controlled development/test acceptance only.' };
const input = { reviewedOn: '2026-10-28', frameworkVersion: '0.2.1', extensions: [{ id: 'rivetin-example', version: '0.3.0', catalogReleases: { v4: null, v3: null } }], catalogPublication: { v3: 3, v4: 1, uniqueExtensions: 3 }, installerProfiles: [] };

test('source version changes preserve historical acceptance without promoting the current candidate', () => {
  const previous = { historicalAcceptance: history };
  const snapshot = createProjectSnapshot({ ...input, previous });
  assert.equal(snapshot.frameworkVersion, '0.2.1');
  assert.deepEqual(snapshot.historicalAcceptance, history);
  assert.deepEqual(snapshot.candidateRelease, { status: 'not-admitted', currentDeployment: 'unverified' });
  assert.equal(snapshot.publicInstallerAvailable, false);
  snapshot.historicalAcceptance.frameworkVersion = '9.9.9';
  assert.equal(previous.historicalAcceptance.frameworkVersion, '0.2.0');
});

test('legacy live flags and source versions cannot manufacture a historical acceptance record', () => {
  const snapshot = createProjectSnapshot({ ...input, previous: { liveFrameworkVersion: '0.1.4', liveRivetinAcceptance: 'development-test-accepted' } });
  assert.equal(snapshot.historicalAcceptance, null);
  assert.equal(Object.hasOwn(snapshot, 'liveFrameworkVersion'), false);
  assert.equal(Object.hasOwn(snapshot, 'liveRivetinAcceptance'), false);
  assert.deepEqual(snapshot.extensions[0].catalogReleases, { v4: null, v3: null });
});

test('historical acceptance must carry a reviewed document fingerprint', () => {
  assert.throws(() => createProjectSnapshot({ ...input, previous: { historicalAcceptance: { ...history, documentSHA256: '' } } }));
});
