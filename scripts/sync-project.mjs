import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import { validateCatalog } from './catalog-contract.mjs';
import { publicCatalogState } from './catalog-files.mjs';
import { attachProjectState } from '../src/extension-copy.mjs';

const website = fileURLToPath(new URL('../', import.meta.url));
const previous=JSON.parse(await readFile(path.join(website,'src/project-state.json'),'utf8'));
const published=await publicCatalogState(website);
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const reviewedOn = option('--reviewed-on');
assert.match(reviewedOn ?? '', /^\d{4}-\d{2}-\d{2}$/u, 'Use --reviewed-on YYYY-MM-DD after reviewing the current project documentation.');
const project = path.resolve(option('--project-root') || path.join(website, '../smartx-extensions'));
const ids = [
  'rivetin-ipmi-redirection', 'rivetin-context-menu', 'rivetin-ssh-channel',
  'rivetin-disk-smart-info', 'rivetin-network-topology', 'rivetin-security-policy-converter',
];
const evidence = [];
async function source(relative) {
  const bytes = await readFile(path.join(project, relative));
  evidence.push({ path: relative.replaceAll('\\','/'), sha256: createHash('sha256').update(bytes).digest('hex') });
  return bytes.toString('utf8').replace(/^\uFEFF/u, '');
}
const framework = JSON.parse(await source('framework/package.json'));
assert.match(framework.version, /^\d+\.\d+\.\d+$/u);
const catalog = JSON.parse(await source('catalog/plugins.json'));
const profiles = JSON.parse(await source('cli/profiles.json'));
validateCatalog(catalog);
for (const file of ['README.md','framework/README.md','cli/README.md','docs/rivetin-naming.md','docs/portable-cli-validation.md','docs/ssh-channel.md','catalog/README.md']) await source(file);
const extensions = [];
for (const id of ids) {
  const manifest = JSON.parse(await source(`plugins/${id}/rivetin.json`));
  const pkg = JSON.parse(await source(`plugins/${id}/package.json`));
  await source(`plugins/${id}/README.md`);
  assert.equal(manifest.id, id);
  assert.equal(pkg.name, id);
  assert.equal(manifest.version, pkg.version, `${id}: package and manifest versions differ`);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/u);
  assert.equal(typeof manifest.name?.['en-US'], 'string');
  assert.ok(!/\p{Script=Han}/u.test(manifest.name['en-US']));
  assert.equal(manifest.compatibility?.frameworkApi ?? manifest.frameworkApi, 1);
  assert.ok(Array.isArray(manifest.compatibility?.towerBuilds));
  assert.ok(manifest.compatibility.towerBuilds.every(build => typeof build === 'string' && /^[A-Za-z0-9._-]{1,120}$/u.test(build)), `${id}: review changed build identifiers`);
  const entry = published.catalog?.plugins.find(plugin => plugin.id === id)??catalog.plugins.find(plugin=>plugin.id===id);
  const catalogHasAsset = Boolean(published.catalog?.plugins.some(plugin=>plugin.id===id&&plugin.status==='published'));
  extensions.push({
    id,
    version: manifest.version,
    manifestName: manifest.name['en-US'],
    frameworkApi: manifest.compatibility?.frameworkApi ?? manifest.frameworkApi,
    declaredTowerBuilds: manifest.compatibility?.towerBuilds ?? [],
    catalogStatus: entry?.status ?? 'not-listed',
    catalogHasAsset: Boolean(catalogHasAsset),
    packageFile: `${id}-${manifest.version}.rivetin.json`,
  });
}
const snapshot = {
  schemaVersion: 1,
  reviewedOn,
  repository: 'https://github.com/sephirothchang/rivetin',
  repositoryVisibility: 'private',
  frameworkVersion: framework.version,
  liveFrameworkVersion: previous.liveFrameworkVersion??previous.frameworkVersion,
  publicInstallerAvailable: false,
  liveRivetinAcceptance: 'development-test-accepted',
  liveAcceptanceScope: 'CloudTower 4.9.0 development/test environment only; not a production or all-version guarantee.',
  liveAcceptanceReview: previous.liveAcceptanceReview,
  catalogPublishedCount: published.catalog?.plugins.filter(p => p.status === 'published').length??0,
  installerProfiles: profiles.map(profile => ({ image: profile.image, node: profile.node, validation: profile.validation })),
  extensions,
};
// These are release assertions, not facts inferable from source versions or local artifacts.
attachProjectState(snapshot);
await writeFile(path.join(website,'src/project-state.json'),JSON.stringify(snapshot,null,2)+'\n');
await mkdir(path.join(website,'.local/content-sync'),{recursive:true});
await writeFile(path.join(website,'.local/content-sync/source-evidence.json'),JSON.stringify({ reviewedOn, files:evidence },null,2)+'\n');
console.log(`Synchronized ${extensions.length} extension manifests; framework ${framework.version}; ${snapshot.catalogPublishedCount} published catalog entries. Review copy if any source version changed.`);
