import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import { publicCatalogState } from './catalog-files.mjs';
import { attachProjectState } from '../src/extension-copy.mjs';
import { createProjectSnapshot } from './project-snapshot.mjs';
import { catalogSummary, catalogMetadata } from '../src/catalog-releases.mjs';

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
const project = path.resolve(option('--project-root') || path.join(website, '../rivetin'));
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
const profiles = JSON.parse(await source('cli/profiles.json'));
for (const file of ['README.md','framework/README.md','cli/README.md','docs/rivetin-naming.md','docs/portable-cli-validation.md','docs/ssh-channel.md','catalog/README.md','docs/0.2-validation.md']) await source(file);
if (previous.historicalAcceptance) {
  const record = evidence.find(item => item.path === previous.historicalAcceptance.reference);
  assert.equal(record?.sha256, previous.historicalAcceptance.documentSHA256, 'Historical validation document changed; review its scope and fingerprint before syncing.');
}
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
  extensions.push({
    id,
    version: manifest.version,
    manifestName: manifest.name['en-US'],
    frameworkApi: manifest.compatibility?.frameworkApi ?? manifest.frameworkApi,
    declaredTowerBuilds: manifest.compatibility?.towerBuilds ?? [],
    compatibility: manifest.compatibility,
    catalogReleases: catalogMetadata(id, published),
    sourcePackageFilename: `${id}-${manifest.version}.rivetin.json`,
  });
}
const snapshot = createProjectSnapshot({
  previous, reviewedOn, frameworkVersion: framework.version,
  catalogPublication: catalogSummary(published),
  installerProfiles: profiles.map(profile => ({ image: profile.image, node: profile.node })),
  extensions,
});
// These are release assertions, not facts inferable from source versions or local artifacts.
attachProjectState(snapshot);
if (args.includes('--check')) {
  assert.deepEqual(snapshot, previous, 'Source snapshot changed; review copy and metadata before writing.');
  console.log('PASS: reviewed source snapshot matches; no files written.');
  process.exit(0);
}
await writeFile(path.join(website,'src/project-state.json'),JSON.stringify(snapshot,null,2)+'\n');
await mkdir(path.join(website,'.local/content-sync'),{recursive:true});
await writeFile(path.join(website,'.local/content-sync/source-evidence.json'),JSON.stringify({ reviewedOn, files:evidence },null,2)+'\n');
console.log(`Synchronized ${extensions.length} source manifests; framework ${framework.version}; v4 ${snapshot.catalogPublication.v4}, historical v3 ${snapshot.catalogPublication.v3}, unique extensions ${snapshot.catalogPublication.uniqueExtensions}. Review copy if any source version changed.`);
