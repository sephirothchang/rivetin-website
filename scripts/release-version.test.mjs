import test from 'node:test';import assert from 'node:assert/strict';import {validReleaseVersion,compareReleaseVersions} from './release-version.mjs';
test('release grammar and decimal ordering',()=>{
 for(const v of ['0.3.0-alpha.1','0.3.0-alpha.10','0.3.0-alpha.1.trial.py312.10','0.3.0-beta','0.3.0'])assert.equal(validReleaseVersion(v),true,v);
 for(const v of ['0.3.0-alpha.01','0.3.0-alpha.0','0.3.0-alpha.1.trial.py312.01','0.3.0-alpha-01','0.3.0-alpha.1.trial.X.1','0.3.0-alpha.1.trial.x.12345678901234567'])assert.equal(validReleaseVersion(v),false,v);
 assert.ok(compareReleaseVersions('0.3.0-alpha.10','0.3.0-alpha.2')>0);assert.ok(compareReleaseVersions('0.3.0-alpha.2.trial.x.10','0.3.0-alpha.2.trial.x.2')>0);assert.ok(compareReleaseVersions('0.3.0-beta','0.3.0-alpha.9999999999999999')>0);assert.ok(compareReleaseVersions('0.3.0-alpha.1','0.3.0')<0);
});
