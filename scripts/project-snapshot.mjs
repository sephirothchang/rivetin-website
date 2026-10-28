import assert from 'node:assert/strict';
export function withReviewedHistoricalFingerprint(previous,actualHash,reviewedHash){
  const copy=structuredClone(previous),history=copy.historicalAcceptance;
  if(!history)return {previous:copy,changed:false,previousSHA256:null,newSHA256:null};
  assert.match(actualHash||'',/^[a-f0-9]{64}$/u);
  if(reviewedHash!==undefined)assert.equal(reviewedHash,actualHash,'Reviewed historical-document fingerprint does not match the current bytes.');
  const prior=history.documentSHA256;
  if(actualHash!==prior){assert.equal(reviewedHash,actualHash,'Historical validation document changed; review its scope and exact fingerprint before syncing.');history.documentSHA256=actualHash;}
  return {previous:copy,changed:actualHash!==prior,previousSHA256:prior,newSHA256:actualHash};
}

// Source review never establishes deployment or release acceptance.
export function createProjectSnapshot({ previous, reviewedOn, frameworkVersion, extensions, catalogPublication, installerProfiles }) {
  assert.match(reviewedOn, /^\d{4}-\d{2}-\d{2}$/u);
  assert.match(frameworkVersion, /^\d+\.\d+\.\d+$/u);
  const historicalAcceptance = previous.historicalAcceptance ?? null;
  const frameworkSourcePublication = previous.frameworkSourcePublication ?? null;
  if (frameworkSourcePublication) {
    assert.deepEqual(Object.keys(frameworkSourcePublication).sort(), ['commit','verifiedOn','version']);
    assert.match(frameworkSourcePublication.version, /^\d+\.\d+\.\d+$/u);
    assert.match(frameworkSourcePublication.commit, /^[a-f0-9]{40}$/u);
    assert.match(frameworkSourcePublication.verifiedOn, /^\d{4}-\d{2}-\d{2}$/u);
  }
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
    frameworkSourcePublication: frameworkSourcePublication ? structuredClone(frameworkSourcePublication) : null,
    publicInstallerAvailable: false,
    candidateRelease: { status: 'not-admitted', currentDeployment: 'unverified' },
    historicalAcceptance: historicalAcceptance ? structuredClone(historicalAcceptance) : null,
    catalogPublication,
    installerProfiles,
    extensions,
  };
}
