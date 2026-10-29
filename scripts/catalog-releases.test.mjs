import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog } from './catalog-contract.mjs';
import { validateV4Catalog } from './catalog-v4-contract.mjs';
import { catalogSummary, selectPluginReleases, catalogMetadata,catalogReleaseIdentity,catalogReadbackDate } from '../src/catalog-releases.mjs';
import {reserveRelease,emptyReleaseLedger} from './catalog-release-contract.mjs';

function entry(id, version, schema = 1, status = 'published') {
  return { id, version, frameworkApi: 1, status,
    downloadPath: status === 'published' ? `/downloads/plugins/${id}/${version}/${id}-${version}.rivetin.json` : null,
    sha256: status === 'published' ? 'a'.repeat(64) : null,
    name: { 'zh-CN': '测试', 'en-US': 'Synthetic fixture' },
    description: { 'zh-CN': '测试', 'en-US': 'Inert catalog-selection fixture.' },
    author: 'Rivetin contributors', license: 'MIT', permissions: [],
    compatibility: { frameworkApi: 1, tower: 'Synthetic test fixture only', towerBuilds: ['4.9.0'],
      ...(schema === 2 ? { schemaVersion: 2, frameworkMinVersion: '0.2.0', frameworkMaxVersionExclusive: '0.3.0', smtx: 'none' } : {}) },
  };
}
function state(current = [entry('rivetin-ipmi-redirection', '0.1.4', 2)]) {
  return { catalog: validateCatalog({ schemaVersion: 3, plugins: [entry('rivetin-ipmi-redirection', '0.1.2'), entry('rivetin-ssh-channel', '0.1.1'), entry('rivetin-disk-smart-info', '0.1.3')] }),
    v4Catalog: validateV4Catalog({ schemaVersion: 4, plugins: current }) };
}

test('v4 published package is the primary download; v3 keeps its exact historical version', () => {
  const selected = selectPluginReleases('rivetin-ipmi-redirection', state(), '0.2.1');
  assert.equal(selected.release.version, '0.1.4');
  assert.equal(selected.release.compatibility.schemaVersion, 2);
  assert.match(selected.release.downloadPath, /\/0\.1\.4\/rivetin-ipmi-redirection-0\.1\.4\.rivetin\.json$/u);
  assert.equal(selected.legacyRelease.version, '0.1.2');
  assert.deepEqual(catalogSummary(state()), { v3: 3, v4: 1, uniqueExtensions: 3 });
  assert.deepEqual(catalogMetadata('rivetin-ipmi-redirection', state()), { v4: { version: '0.1.4', status: 'published' }, v3: { version: '0.1.2', status: 'published' } });
});

for (const [name, current] of [['empty', []], ['draft', [entry('rivetin-ipmi-redirection', '0.1.4', 2, 'draft')]]]) {
  test(`${name} v4 does not promote the historical v3 package to a 0.2 download`, () => {
    const selected = selectPluginReleases('rivetin-ipmi-redirection', state(current), '0.2.1');
    assert.equal(selected.release, null);
    assert.equal(selected.currentRelease, null);
    assert.equal(selected.legacyRelease.version, '0.1.2');
    assert.equal(catalogSummary(state(current)).v4, 0);
  });
}

test('current framework minimum is inclusive and deprecated maximum never blocks selection', () => {
  assert.equal(selectPluginReleases('rivetin-ipmi-redirection', state(), '0.2.0').release.version, '0.1.4');
  for (const version of ['0.1.9', 'unknown']) {
    const selected = selectPluginReleases('rivetin-ipmi-redirection', state(), version);
    assert.equal(selected.release, null);
    assert.equal(selected.currentRelease.version, '0.1.4');
    assert.equal(selected.legacyRelease.version, '0.1.2');
  }
});

test('other legacy-only or source-only plugins never inherit the published IPMI download', () => {
  const legacy = selectPluginReleases('rivetin-ssh-channel', state(), '0.2.1');
  assert.equal(legacy.release, null);
  assert.equal(legacy.legacyRelease.version, '0.1.1');
  const sourceOnly = selectPluginReleases('rivetin-context-menu', state(), '0.2.1');
  assert.deepEqual(sourceOnly, { currentRelease: null, legacyRelease: null, release: null });
});
test('catalog ID is separate from schema/plugin versions and bad optional metadata never changes package selection',()=>{
 const s=state(),before=selectPluginReleases('rivetin-ipmi-redirection',s,'0.2.2');assert.deepEqual(catalogReleaseIdentity(s),{status:'unregistered',publicationId:null});const raw=Buffer.from(JSON.stringify(s.v4Catalog)),p=reserveRelease(emptyReleaseLedger(),raw,'2026-10-29T00:00:00.000Z');p.ledger.releases[0].status='local-committed';p.ledger.currentPublicationId=p.record.publicationId;
 const valid={...s,v4Raw:raw,releaseMetadata:p.metadata,publications:p.ledger};assert.equal(catalogReleaseIdentity(valid).publicationId,'ML-V4-261029.0');assert.equal(catalogReleaseIdentity(valid).publicationState,'local-committed');const bad={...valid,releaseMetadata:{...p.metadata,catalogSHA256:'0'.repeat(64)}};assert.equal(catalogReleaseIdentity(bad).status,'unverified');assert.deepEqual(selectPluginReleases('rivetin-ipmi-redirection',bad,'0.2.2'),before);
});

test('readback date uses Shanghai across UTC midnight and pending never acquires a verification date',()=>{
 const verified={status:'registered',publicationState:'verified',verifiedAt:'2026-10-28T20:37:23.723Z'};
 assert.equal(catalogReadbackDate(verified),'2026-10-29');
 assert.equal(catalogReadbackDate({...verified,verifiedAt:'2026-10-28T15:59:59.999Z'}),'2026-10-28');
 assert.equal(catalogReadbackDate({...verified,verifiedAt:'2026-10-28T16:00:00.000Z'}),'2026-10-29');
 for(const identity of [null,{status:'unregistered'},{...verified,status:'unverified'},{...verified,publicationState:'local-committed'},{...verified,verifiedAt:null},{...verified,verifiedAt:'invalid'}])assert.equal(catalogReadbackDate(identity),null);
});

test('minimum-only selection ignores legacy upper values but enforces no-max024 reader floor',()=>{
 const rawState=item=>({...state(),v4Catalog:{schemaVersion:4,plugins:[item]}});
 for(const maximum of ['0.2.0','0.2.1','0.3.0']){const current=entry('rivetin-ipmi-redirection','0.1.4',2);current.compatibility.frameworkMaxVersionExclusive=maximum;for(const version of ['0.2.0','0.3.0','1.0.0'])assert.equal(selectPluginReleases(current.id,state([current]),version).release,current);}
 const fresh=entry('rivetin-ipmi-redirection','0.1.4',2);delete fresh.compatibility.frameworkMaxVersionExclusive;fresh.compatibility.frameworkMinVersion='0.2.4';assert.equal(selectPluginReleases(fresh.id,state([fresh]),'0.2.3').release,null);assert.equal(selectPluginReleases(fresh.id,state([fresh]),'0.2.4').release,fresh);assert.equal(selectPluginReleases(fresh.id,state([fresh]),'1.0.0').release,fresh);fresh.compatibility.frameworkMinVersion='0.2.3';assert.throws(()=>state([fresh]),/COMPATIBILITY/u);assert.equal(selectPluginReleases(fresh.id,rawState(fresh),'1.0.0').release,null);
 for(const value of ['bad',' 0.3.0',null,undefined]){const malformed=entry('rivetin-ipmi-redirection','0.1.4',2);malformed.compatibility.frameworkMaxVersionExclusive=value;assert.throws(()=>state([malformed]),/COMPATIBILITY/u);assert.equal(selectPluginReleases(malformed.id,rawState(malformed),'1.0.0').release,null);}
 const wrongApi=entry('rivetin-ipmi-redirection','0.1.4',2);wrongApi.compatibility.frameworkApi=2;assert.throws(()=>state([wrongApi]),/COMPATIBILITY/u);assert.equal(selectPluginReleases(wrongApi.id,rawState(wrongApi),'0.2.4').release,null);
});
