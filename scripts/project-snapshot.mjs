import assert from 'node:assert/strict';

// Source review never establishes deployment or release acceptance.
export function createProjectSnapshot({ previous, reviewedOn, frameworkVersion, extensions, catalogPublication, installerProfiles }) {
  assert.match(reviewedOn, /^\d{4}-\d{2}-\d{2}$/u);
  assert.match(frameworkVersion, /^\d+\.\d+\.\d+$/u);
  const historicalAcceptance = previous.historicalAcceptance ?? null;
  if (historicalAcceptance) {
    assert.match(historicalAcceptance.frameworkVersion, /^\d+\.\d+\.\d+$/u);
    assert.match(historicalAcceptance.reviewedOn, /^\d{4}-\d{2}-\d{2}$/u);
    assert.equal(historicalAcceptance.reference, 'docs/0.2-validation.md');
    assert.match(historicalAcceptance.documentSHA256, /^[a-f0-9]{64}$/u);
    assert.equal(typeof historicalAcceptance.scope, 'string');
    assert.ok(historicalAcceptance.scope.length > 0);
  }
  return {
    schemaVersion: 2,
    reviewedOn,
    repository: 'https://github.com/sephirothchang/rivetin',
    repositoryVisibility: 'private',
    frameworkVersion,
    publicInstallerAvailable: false,
    candidateRelease: { status: 'not-admitted', currentDeployment: 'unverified' },
    historicalAcceptance: historicalAcceptance ? structuredClone(historicalAcceptance) : null,
    catalogPublication,
    installerProfiles,
    extensions,
  };
}
