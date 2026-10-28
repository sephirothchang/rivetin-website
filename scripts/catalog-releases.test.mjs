import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog } from './catalog-contract.mjs';
import { validateV4Catalog } from './catalog-v4-contract.mjs';
import { catalogSummary, selectPluginReleases, catalogMetadata } from '../src/catalog-releases.mjs';

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

test('current framework range is inclusive at minimum and exclusive at maximum', () => {
  assert.equal(selectPluginReleases('rivetin-ipmi-redirection', state(), '0.2.0').release.version, '0.1.4');
  for (const version of ['0.1.9', '0.3.0', 'unknown']) {
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
