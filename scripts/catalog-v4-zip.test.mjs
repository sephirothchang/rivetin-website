import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, packagePath, parsePackagePath, packageMaxBytes, MAX_PACKAGE_BYTES, MAX_ZIP_PACKAGE_BYTES } from './catalog-contract.mjs';
import { validateV4Catalog, validateV4Package, validateV4Transition, V4_INDEX_PATH } from './catalog-v4-contract.mjs';
import { validateStandardZip } from './standard-zip.mjs';
import { frozenV4Drop, stageV4 } from './catalog-v4-staging.mjs';
import { readbackV4 } from './readback-catalog-v4.mjs';
import { importV4 } from './import-catalog-v4.mjs';
import { importCatalog, publicCatalogState } from './catalog-files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

const zipCrcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
function crc32(content) {
  let value = 0xffffffff;
  for (const byte of content) value = zipCrcTable[(value ^ byte) & 255] ^ value >>> 8;
  return (value ^ 0xffffffff) >>> 0;
}
// Minimal deterministic store-only ZIP writer (no dependency, regular files only).
function buildZip(files, { mode = 0o100644 } = {}) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, body] of files) {
    const nameBytes = Buffer.from(name, 'utf8'), content = Buffer.from(body);
    const crc = crc32(content);
    const header = Buffer.alloc(30), dir = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(content.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x800, 8);
    dir.writeUInt16LE(0, 10);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(content.length, 20);
    dir.writeUInt32LE(content.length, 24);
    dir.writeUInt16LE(nameBytes.length, 28);
    dir.writeUInt32LE((mode << 16) >>> 0, 38);
    dir.writeUInt32LE(offset, 42);
    local.push(header, nameBytes, content);
    central.push(dir, nameBytes);
    offset += 30 + nameBytes.length + content.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

const strictCompat = { schemaVersion: 2, frameworkApi: 1, tower: 'Fixture build', towerBuilds: ['4.9.0'],
  frameworkMinVersion: '0.3.0', smtx: 'none' };
function standardMetadata(id = 'rivetin-zip', version = '0.3.0', overrides = {}) {
  return {
    metadataVersion: 2,
    id,
    version,
    name: { 'zh-CN': '测试插件', 'en-US': 'Fixture plugin' },
    description: { 'zh-CN': '用于官网工具链测试的固定包。', 'en-US': 'Fixture package for the site toolchain tests.' },
    author: 'Rivetin contributors',
    license: 'MIT',
    homepage: 'https://rivetin.dev/',
    repository: 'https://github.com/sephirothchang/rivetin',
    compatibility: strictCompat,
    architectures: ['amd64'],
    runtimeEnvironment: 'rivetin-runtime-1.1.0',
    frontend: { entry: 'plugin.js', format: 'rivetin-global-v1' },
    backend: { entry: 'entrypoint.py' },
    permissions: [],
    locales: ['zh-CN', 'en-US'],
    configuration: { version: 1, defaults: {}, schema: { type: 'object', properties: {}, required: [], additionalProperties: false } },
    lifecycle: { reset: 'defaults', uninstall: 'retain-config' },
    releaseNotes: { 'zh-CN': '测试', 'en-US': 'fixture' },
    ...overrides,
  };
}
function standardZipFixture(id = 'rivetin-zip', version = '0.3.0', { metadata = null, files } = {}) {
  const value = metadata ?? standardMetadata(id, version);
  const entries = [['metadata', JSON.stringify(value)], ['LICENSE', 'MIT License'], ['plugin.js', '/* inert */'], ['entrypoint.py', 'pass']];
  const raw = buildZip(files ?? entries);
  const entry = { id: value.id, version: value.version, frameworkApi: 1, status: 'published', downloadPath: packagePath(id, version, 'zip'), sha256: sha256(raw),
    name: value.name, description: value.description, author: value.author, license: value.license, permissions: value.permissions, compatibility: value.compatibility };
  return { raw, metadata: value, entry };
}
const legacyCompat = { frameworkApi: 1, tower: 'Fixture build', towerBuilds: ['4.9.0'] };
function legacyFixture(id = 'rivetin-legacy', version = '0.1.0', compatibility = legacyCompat) {
  const manifest = { manifestVersion: 1, id, version, name: { 'zh-CN': '测试', 'en-US': 'Fixture' },
    description: { 'zh-CN': '测试', 'en-US': 'Inert fixture' }, author: 'Rivetin contributors', license: 'MIT', permissions: [],
    compatibility,
    frontend: { entry: 'web/plugin.js', format: 'rivetin-global-v1' } };
  const files = [['web/plugin.js', '/* inert */'], ['LICENSE', 'MIT License']].map(([file, body]) => ({ path: file, data: Buffer.from(body).toString('base64'), sha256: sha256(Buffer.from(body)) }));
  const raw = encode({ format: 'rivetin-package-v1', manifest, files });
  const { frontend, manifestVersion, ...meta } = manifest;
  return { raw, entry: { ...meta, frameworkApi: 1, status: 'published', downloadPath: packagePath(id, version), sha256: sha256(raw) } };
}

async function workspace(t) {
  await mkdir(path.join(root, '.local', 'catalog-v4-zip-tests'), { recursive: true });
  const dir = await mkdtemp(path.join(root, '.local', 'catalog-v4-zip-tests', 'run-'));
  t.after(async () => { const base = path.resolve(root, '.local', 'catalog-v4-zip-tests') + path.sep; assert.ok(path.resolve(dir).startsWith(base)); await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const site = path.join(dir, 'site'); await mkdir(path.join(site, 'scripts'), { recursive: true });
  return { dir, site };
}
async function drop(dir, name, items, baseHash = 'f'.repeat(64)) {
  const location = path.join(dir, name), catalogPath = 'catalog/v4/plugins.json';
  const index = encode({ schemaVersion: 4, plugins: items.map(item => item.entry) });
  const stage = encode({ schemaVersion: 1, preparedAt: new Date().toISOString(), catalogPath, baseCatalogSHA256: baseHash,
    indexPath: '/' + catalogPath, indexSHA256: sha256(index),
    packages: items.filter(item => item.entry.status === 'published').map(({ entry, raw }) => ({ id: entry.id, version: entry.version, downloadPath: entry.downloadPath, sha256: entry.sha256, bytes: raw.length })),
    candidateOnly: true });
  await mkdir(path.dirname(path.join(location, catalogPath)), { recursive: true });
  await writeFile(path.join(location, catalogPath), index); await writeFile(path.join(location, 'stage.json'), stage);
  for (const { entry, raw } of items.filter(item => item.entry.status === 'published')) {
    const target = path.join(location, entry.downloadPath); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, raw);
  }
  return { location, index, stage, baseHash };
}
async function legacyState(t) {
  const { dir, site } = await workspace(t);
  const item = legacyFixture();
  const v3 = await dropV3(dir, item);
  await importCatalog({ siteRoot: site, dropRoot: v3.location, stageHash: sha256(v3.stage) });
  return { dir, site, item };
}
async function dropV3(dir, item) {
  const location = path.join(dir, 'v3'), catalogPath = 'catalog/plugins.json';
  const index = encode({ schemaVersion: 3, plugins: [item.entry] });
  const stage = encode({ schemaVersion: 1, preparedAt: new Date().toISOString(), catalogPath, baseCatalogSHA256: 'f'.repeat(64),
    indexPath: '/' + catalogPath, indexSHA256: sha256(index),
    packages: [{ id: item.entry.id, version: item.entry.version, downloadPath: item.entry.downloadPath, sha256: item.entry.sha256, bytes: item.raw.length }],
    candidateOnly: true });
  await mkdir(path.dirname(path.join(location, catalogPath)), { recursive: true });
  await writeFile(path.join(location, catalogPath), index); await writeFile(path.join(location, 'stage.json'), stage);
  const target = path.join(location, item.entry.downloadPath); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, item.raw);
  return { location, index, stage, baseHash: 'f'.repeat(64) };
}

test('v4 accepts standard-ZIP rows, mixed legacy rows and prerelease versions; exact duplicate rows fail', () => {
  const legacy = legacyFixture('rivetin-mixed', '0.1.0', strictCompat);
  const zip = standardZipFixture('rivetin-mixed', '0.2.0');
  const prerelease = standardZipFixture('rivetin-pre', '0.3.0-alpha.2');
  assert.doesNotThrow(() => validateV4Catalog({ schemaVersion: 4, plugins: [legacy.entry, zip.entry] }));
  assert.doesNotThrow(() => validateV4Catalog({ schemaVersion: 4, plugins: [prerelease.entry] }));
  assert.doesNotThrow(() => validateV4Catalog({ schemaVersion: 4, plugins: [legacy.entry, { ...zip.entry, version: legacy.entry.version, downloadPath: packagePath('rivetin-mixed', '0.1.0', 'zip'), sha256: 'a'.repeat(64) }] }), 'legacy + ZIP successor for the same version is allowed');
  assert.throws(() => validateV4Catalog({ schemaVersion: 4, plugins: [zip.entry, zip.entry] }), /DUPLICATE/u);
  const legacyRow = legacy.entry;
  assert.throws(() => validateV4Catalog({ schemaVersion: 4, plugins: [{ ...legacyRow, version: legacy.entry.version, downloadPath: packagePath(legacyRow.id, legacyRow.version, 'zip'), sha256: 'a'.repeat(64) }, { ...legacyRow, downloadPath: packagePath(legacyRow.id, legacyRow.version, 'zip'), sha256: 'a'.repeat(64) }] }), /DUPLICATE/u);
  assert.throws(() => validateV4Catalog({ schemaVersion: 4, plugins: [{ ...zip.entry, version: 'not-a-version' }] }), /V4_ENTRY_INVALID/u);
  assert.equal(parsePackagePath(zip.entry.downloadPath).extension, 'zip');
  assert.equal(parsePackagePath(legacy.entry.downloadPath).extension, 'rivetin.json');
  assert.equal(packageMaxBytes('zip'), MAX_ZIP_PACKAGE_BYTES);
  assert.equal(packageMaxBytes('rivetin.json'), MAX_PACKAGE_BYTES);
  assert.throws(() => packagePath('rivetin-x', '0.1.0', 'tar.gz'), /IDENTITY_INVALID/u);
});

test('standard ZIP packages bind catalog identity and retain the deprecated upper-bound carrier only in the catalog', () => {
  const fixture = standardZipFixture();
  assert.doesNotThrow(() => validateV4Package(fixture.raw, fixture.entry));
  const carrier = { ...fixture.entry, compatibility: { ...fixture.entry.compatibility, frameworkMaxVersionExclusive: '0.3.0' } };
  assert.doesNotThrow(() => validateV4Package(fixture.raw, carrier), 'catalog-only legacy upper carrier is not part of package identity');
  const mismatched = structuredClone(fixture.entry); mismatched.author = 'Someone else';
  assert.throws(() => validateV4Package(fixture.raw, mismatched), /V4_PACKAGE_MISMATCH/u);
  const changedPermissions = structuredClone(fixture.entry); changedPermissions.permissions = ['inventory.read'];
  assert.throws(() => validateV4Package(fixture.raw, changedPermissions), /V4_PACKAGE_MISMATCH/u);
  assert.equal(validateV4Package(fixture.raw, fixture.entry).downloadPath, fixture.entry.downloadPath);
  assert.equal(validateV4Package(fixture.raw, fixture.entry).sha256, fixture.entry.sha256);
  assert.equal(parsePackagePath(validateV4Package(fixture.raw, fixture.entry).downloadPath).extension, 'zip');
});

test('standard ZIP structural and metadata failures fail closed', () => {
  const zip = (files, options) => buildZip(files, options);
  const base = files => [['metadata', JSON.stringify(standardMetadata())], ['LICENSE', 'MIT License'], ['plugin.js', 'x'], ['entrypoint.py', 'pass']].map(([name, body]) => [name, files?.[name] ?? body]);
  assert.throws(() => validateStandardZip(zip(base().filter(([name]) => name !== 'metadata'))), /METADATA_REQUIRED/u);
  assert.throws(() => validateStandardZip(zip([...base(), ['duplicate.txt', 'a'], ['DUPLICATE.txt', 'b']])), /ZIP_INVALID/u);
  assert.throws(() => validateStandardZip(zip([...base(), ['../escape', 'x']])), /ZIP_INVALID/u);
  assert.throws(() => validateStandardZip(zip(base(), { mode: 0o120777 })), /ZIP_INVALID/u);
  assert.throws(() => validateStandardZip(zip(base().filter(([name]) => name !== 'LICENSE'))), /LICENSE_REQUIRED/u);
  assert.throws(() => validateStandardZip(zip(base().filter(([name]) => name !== 'plugin.js'))), /ENTRY_REQUIRED/u);
  assert.throws(() => validateStandardZip(zip(base().filter(([name]) => name !== 'entrypoint.py'))), /ENTRY_REQUIRED/u);
  const mutate = overrides => zip([['metadata', JSON.stringify(standardMetadata('rivetin-zip', '0.3.0', overrides))], ['LICENSE', 'MIT'], ['plugin.js', 'x'], ['entrypoint.py', 'pass']]);
  assert.throws(() => validateStandardZip(mutate({ metadataVersion: 1 })), /METADATA_INVALID/u);
  assert.throws(() => validateStandardZip(mutate({ unknownField: true })), /METADATA_INVALID/u);
  assert.throws(() => validateStandardZip(mutate({ architectures: ['arm64'] })), /ARCHITECTURE_UNSUPPORTED/u);
  assert.throws(() => validateStandardZip(mutate({ runtimeEnvironment: 'rivetin-runtime-9.9.9' })), /RUNTIME_ENVIRONMENT_UNSUPPORTED/u);
  assert.throws(() => validateStandardZip(mutate({ version: 'v0.3.0' })), /METADATA_INVALID/u);
  assert.throws(() => validateStandardZip(zip([['metadata', 'not json'], ['LICENSE', 'MIT'], ['plugin.js', 'x'], ['entrypoint.py', 'pass']])), /METADATA_INVALID/u);
  assert.throws(() => validateStandardZip(zip(base()), { limits: { maxEntryBytes: 8 } }), /ZIP_INVALID/u);
  assert.throws(() => validateStandardZip(zip(base()), { limits: { maxPackageBytes: 64 } }), /ZIP_TOO_LARGE/u);
  assert.throws(() => validateStandardZip(zip(base()), { expectedId: 'rivetin-other' }), /ID_MISMATCH/u);
});

test('v4 transition is release-version aware and immutable per id/version/extension', () => {
  const oldZip = standardZipFixture('rivetin-t', '0.3.0-alpha.2');
  const previous = { schemaVersion: 4, plugins: [oldZip.entry] };
  assert.throws(() => validateV4Transition(previous, { schemaVersion: 4, plugins: [{ ...standardZipFixture('rivetin-t', '0.3.0-alpha.1').entry }] }), /VERSION_DOWNGRADE/u);
  assert.throws(() => validateV4Transition(previous, { schemaVersion: 4, plugins: [{ ...oldZip.entry, sha256: 'a'.repeat(64) }] }), /SAME_VERSION_IMMUTABLE/u);
  assert.doesNotThrow(() => validateV4Transition(previous, { schemaVersion: 4, plugins: [oldZip.entry, standardZipFixture('rivetin-t', '0.3.0').entry] }));
  const legacy = legacyFixture('rivetin-t', '0.1.0', strictCompat);
  assert.doesNotThrow(() => validateV4Transition({ schemaVersion: 4, plugins: [legacy.entry] }, { schemaVersion: 4, plugins: [legacy.entry, standardZipFixture('rivetin-t', '0.1.0').entry] }), 'legacy + ZIP successor for the same version is a valid migration');
  assert.doesNotThrow(() => validateV4Transition(previous, { schemaVersion: 4, plugins: [] }), 'full delisting remains an index-only change');
});

test('ZIP staging, import, readback and ledger keep both package formats', async t => {
  const { dir, site, item } = await legacyState(t);
  const zip = standardZipFixture('rivetin-zip', '0.3.0-alpha.1');
  const zipDrop = await drop(dir, 'v4-zip', [zip]);
  const staged = await stageV4({ siteRoot: site, dropRoot: zipDrop.location, stageHash: sha256(zipDrop.stage), baseHash: zipDrop.baseHash, output: path.join(site, '.local', 'zip-stage') });
  assert.equal(staged.added, 1);
  assert.deepEqual(await readFile(path.join(staged.output, zip.entry.downloadPath)), zip.raw);
  const installed = await importV4({ siteRoot: site, dropRoot: zipDrop.location, stageHash: sha256(zipDrop.stage), baseHash: zipDrop.baseHash });
  assert.equal(installed.result, 'committed');
  const state = await publicCatalogState(site);
  assert.equal(state.packages.length, 2);
  assert.ok(state.packages.some(record => record.path === zip.entry.downloadPath && record.bytes === zip.raw.length));
  assert.deepEqual(await readFile(path.join(site, 'public', zip.entry.downloadPath)), zip.raw);
  assert.deepEqual(await readFile(path.join(site, 'public', item.entry.downloadPath)), item.raw);

  const output = path.join(dir, 'zip-proof');
  const bodies = new Map([['https://rivetin.dev' + V4_INDEX_PATH, zipDrop.index], ['https://rivetin.dev' + zip.entry.downloadPath, zip.raw]]);
  const fetcher = async url => new Response(bodies.get(url), { status: 200, headers: { 'content-type': url.endsWith('.zip') ? 'application/zip' : 'application/json' } });
  const receipts = await readbackV4({ dropRoot: zipDrop.location, stageHash: sha256(zipDrop.stage), baseHash: zipDrop.baseHash, output, fetcher });
  assert.equal(receipts.length, 2);
  assert.equal(receipts[0].path, V4_INDEX_PATH);
  assert.deepEqual(await readFile(path.join(output, 'catalog.plugins.json')), zipDrop.index);
  const packageReceipt = receipts.find(receipt => receipt.path === zip.entry.downloadPath);
  assert.equal(packageReceipt.bytes, zip.raw.length);
  assert.equal(packageReceipt.sha256, zip.entry.sha256);
  const zipBody = zip.entry.downloadPath.split('/').at(-1);
  assert.deepEqual(await readFile(path.join(output, zipBody)), zip.raw);
  assert.deepEqual(JSON.parse(await readFile(path.join(output, zipBody.replace(/\.zip$/u, '.receipt.json')), 'utf8')), packageReceipt);

  const wrongType = path.join(dir, 'zip-proof-wrong-type');
  await assert.rejects(readbackV4({ dropRoot: zipDrop.location, stageHash: sha256(zipDrop.stage), baseHash: zipDrop.baseHash, output: wrongType,
    fetcher: async url => new Response(bodies.get(url), { status: 200, headers: { 'content-type': 'application/json' } }) }), /HTTPS_CONTENT_TYPE/u);
  await assert.rejects(readFile(path.join(wrongType, 'catalog.plugins.json')), /ENOENT/u);
});

