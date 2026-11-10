// Read-only standard ZIP package reader for the website catalog pipeline.
//
// This is the website-side counterpart of the framework install contract
// (`framework/server/runtime-zip.js` + `framework/server/standard-package.js`).
// The website repo has no runtime dependency on the framework, so the bounded
// central-directory reader and the metadata-v2 checks needed to derive a v4
// catalog identity are mirrored here. The whole-ZIP SHA-256 is the package id;
// embedded plugin code is never imported or executed.
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { fail, validId } from './catalog-contract.mjs';
import { validReleaseVersion } from './release-version.mjs';
import {
  MAX_STANDARD_ENTRIES, MAX_STANDARD_ENTRY_BYTES, MAX_STANDARD_METADATA_BYTES, MAX_STANDARD_PACKAGE_BYTES,
  MAX_STANDARD_TOTAL_BYTES,
} from './package-limits.mjs';
import { RUNTIME_ARCHITECTURE, RUNTIME_ENVIRONMENT } from './runtime-identity.mjs';

export const ZIP_MAGIC = 0x04034b50;
export const STANDARD_METADATA_FILE = 'metadata';
export const STANDARD_FRONTEND_ENTRY = 'plugin.js';
export const STANDARD_BACKEND_ENTRY = 'entrypoint.py';
export const STANDARD_METADATA_VERSION = 2;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const languageText = value => object(value) && Object.keys(value).sort().join() === 'en-US,zh-CN' &&
  text(value['zh-CN'], 4096) && text(value['en-US'], 4096);
const origin = value => typeof value === 'string' && value.length <= 500 && /^https:\/\/[^\s]+$/u.test(value);

const metadataKeys = new Set(['metadataVersion', 'id', 'version', 'name', 'description', 'author', 'license',
  'homepage', 'repository', 'compatibility', 'architectures', 'runtimeEnvironment', 'frontend', 'backend',
  'permissions', 'locales', 'configuration', 'lifecycle', 'releaseNotes']);
const architectures = new Set(['amd64', 'arm64']);

const table = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
function crc32(content) {
  let value = 0xffffffff;
  for (const byte of content) value = table[(value ^ byte) & 255] ^ value >>> 8;
  return (value ^ 0xffffffff) >>> 0;
}
const safeEntry = value => typeof value === 'string' && value.length <= 180 &&
  /^[A-Za-z0-9_-][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/u.test(value) &&
  value.split('/').every(part => !['.', '..'].includes(part) && !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/iu.test(part));

/** True when the buffer starts with a ZIP local-file header. */
export function isZipPackage(raw) {
  return Buffer.isBuffer(raw) && raw.length >= 4 && raw.readUInt32LE(0) === ZIP_MAGIC;
}

function entriesOf(raw, limits) {
  const { maxEntries, maxEntryBytes, maxTotalBytes, maxPackageBytes } = limits;
  if (![maxEntries, maxEntryBytes, maxTotalBytes, maxPackageBytes].every(value => Number.isSafeInteger(value) && value > 0) ||
      maxEntries > 65535 || !Buffer.isBuffer(raw) || raw.length < 22 || raw.length > maxPackageBytes) fail('CATALOG_ZIP_TOO_LARGE');
  let end = raw.length - 22;
  while (end >= Math.max(0, raw.length - 65557) && raw.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || raw.readUInt32LE(end) !== 0x06054b50 || end + 22 + raw.readUInt16LE(end + 20) !== raw.length ||
      raw.readUInt16LE(end + 4) || raw.readUInt16LE(end + 6)) fail('CATALOG_ZIP_INVALID');
  const count = raw.readUInt16LE(end + 8), start = raw.readUInt32LE(end + 16);
  if (!count || count > Math.min(maxEntries, 65535) || count !== raw.readUInt16LE(end + 10) || start + raw.readUInt32LE(end + 12) !== end) fail('CATALOG_ZIP_INVALID');
  const result = new Map(), folded = new Map(), spans = [];
  let cursor = start, total = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || raw.readUInt32LE(cursor) !== 0x02014b50) fail('CATALOG_ZIP_INVALID');
    const flags = raw.readUInt16LE(cursor + 8), method = raw.readUInt16LE(cursor + 10), crc = raw.readUInt32LE(cursor + 16);
    const compressed = raw.readUInt32LE(cursor + 20), bytes = raw.readUInt32LE(cursor + 24);
    const length = raw.readUInt16LE(cursor + 28), extra = raw.readUInt16LE(cursor + 30), comment = raw.readUInt16LE(cursor + 32), offset = raw.readUInt32LE(cursor + 42);
    const mode = raw.readUInt32LE(cursor + 38) >>> 16;
    if (flags & ~0x800 || ![0, 8].includes(method) || bytes > maxEntryBytes || bytes > Math.max(1, compressed) * 512 ||
        (total += bytes) > maxTotalBytes || ![0, 0x8000].includes(mode & 0xf000) || mode & 0o7000 ||
        raw.readUInt16LE(cursor + 34) || cursor + 46 + length + extra + comment > end || offset + 30 > start) fail('CATALOG_ZIP_INVALID');
    const nameBytes = raw.subarray(cursor + 46, cursor + 46 + length), name = nameBytes.toString('utf8');
    if (!safeEntry(name) || name.split('/').length > 16 || folded.has(name.toLowerCase()) ||
        !Buffer.from(name, 'utf8').equals(nameBytes) || raw.readUInt32LE(offset) !== ZIP_MAGIC ||
        raw.readUInt16LE(offset + 6) !== flags || raw.readUInt16LE(offset + 8) !== method || raw.readUInt32LE(offset + 14) !== crc ||
        raw.readUInt32LE(offset + 18) !== compressed || raw.readUInt32LE(offset + 22) !== bytes) fail('CATALOG_ZIP_INVALID');
    const localLength = raw.readUInt16LE(offset + 26), localExtra = raw.readUInt16LE(offset + 28), data = offset + 30 + localLength + localExtra;
    if (!raw.subarray(offset + 30, offset + 30 + localLength).equals(nameBytes) || data + compressed > start) fail('CATALOG_ZIP_INVALID');
    const body = raw.subarray(data, data + compressed);
    const content = method === 8 ? inflateRawSync(body, { maxOutputLength: Math.max(1, bytes) }) : Buffer.from(body);
    if (content.length !== bytes || crc32(content) !== crc) fail('CATALOG_ZIP_INVALID');
    result.set(name, content); folded.set(name.toLowerCase(), name); spans.push([offset, data + compressed]);
    cursor += 46 + length + extra + comment;
  }
  if (cursor !== end) fail('CATALOG_ZIP_INVALID');
  spans.sort((a, b) => a[0] - b[0]);
  if (spans[0][0] !== 0 || spans.at(-1)[1] !== start || spans.some((row, index) => index && spans[index - 1][1] !== row[0])) fail('CATALOG_ZIP_INVALID');
  const directories = new Map();
  for (const name of result.keys()) for (let split = 1; split < name.split('/').length; split++) {
    const directory = name.split('/').slice(0, split).join('/'), key = directory.toLowerCase();
    if (folded.has(key) || directories.has(key) && directories.get(key) !== directory) fail('CATALOG_ZIP_INVALID');
    directories.set(key, directory);
  }
  return result;
}

function metadata(value) {
  if (!object(value) || Object.keys(value).some(key => !metadataKeys.has(key))) fail('CATALOG_ZIP_METADATA_INVALID');
  if (value.metadataVersion !== STANDARD_METADATA_VERSION) fail('CATALOG_ZIP_METADATA_INVALID');
  if (!validId(value.id)) fail('CATALOG_ZIP_METADATA_INVALID');
  if (!validReleaseVersion(value.version)) fail('CATALOG_ZIP_METADATA_INVALID');
  if (!['author', 'license', 'homepage', 'repository'].every(key => text(value[key], 500)) ||
      !languageText(value.name) || !languageText(value.description) ||
      !origin(value.homepage) || !origin(value.repository) || value.license !== 'MIT' ||
      !object(value.compatibility) || !Array.isArray(value.permissions) || !Array.isArray(value.locales) ||
      !object(value.configuration) || !object(value.lifecycle) || !object(value.releaseNotes)) fail('CATALOG_ZIP_METADATA_INVALID');
  if (!Array.isArray(value.architectures) || !value.architectures.length || value.architectures.length > 4 ||
      new Set(value.architectures).size !== value.architectures.length ||
      value.architectures.some(row => !architectures.has(row))) fail('CATALOG_ZIP_METADATA_INVALID');
  if (!value.architectures.includes(RUNTIME_ARCHITECTURE)) fail('CATALOG_ZIP_ARCHITECTURE_UNSUPPORTED');
  if (value.runtimeEnvironment !== RUNTIME_ENVIRONMENT) fail('CATALOG_ZIP_RUNTIME_ENVIRONMENT_UNSUPPORTED');
  if (value.frontend === undefined && value.backend === undefined) fail('CATALOG_ZIP_ENTRY_REQUIRED');
  if (value.frontend !== undefined &&
      (!object(value.frontend) || Object.keys(value.frontend).some(key => !['entry', 'format'].includes(key)) ||
       value.frontend.entry !== STANDARD_FRONTEND_ENTRY ||
       value.frontend.format !== undefined && value.frontend.format !== 'rivetin-global-v1')) fail('CATALOG_ZIP_ENTRY_INVALID');
  if (value.backend !== undefined) {
    if (!object(value.backend)) fail('CATALOG_ZIP_ENTRY_INVALID');
    if (Object.hasOwn(value.backend, 'entry') && value.backend.entry !== STANDARD_BACKEND_ENTRY) fail('CATALOG_ZIP_ENTRY_INVALID');
  }
  return value;
}

/**
 * Validate one standard ZIP plugin package and return its catalog identity.
 * `expectedId` optionally binds the archive to a plugin id (staging/import).
 */
export function validateStandardZip(raw, { expectedId, limits } = {}) {
  const entries = entriesOf(raw, {
    maxEntries: MAX_STANDARD_ENTRIES, maxEntryBytes: MAX_STANDARD_ENTRY_BYTES,
    maxTotalBytes: MAX_STANDARD_TOTAL_BYTES, maxPackageBytes: MAX_STANDARD_PACKAGE_BYTES, ...limits,
  });
  const metadataBytes = entries.get(STANDARD_METADATA_FILE);
  if (!metadataBytes?.length) fail('CATALOG_ZIP_METADATA_REQUIRED');
  if (metadataBytes.length > MAX_STANDARD_METADATA_BYTES) fail('CATALOG_ZIP_METADATA_INVALID');
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(metadataBytes)); }
  catch { fail('CATALOG_ZIP_METADATA_INVALID'); }
  value = metadata(value);
  if (expectedId !== undefined && value.id !== expectedId) fail('CATALOG_ZIP_ID_MISMATCH');
  if (!entries.get('LICENSE')?.length) fail('CATALOG_ZIP_LICENSE_REQUIRED');
  if (value.frontend !== undefined && !entries.get(STANDARD_FRONTEND_ENTRY)?.length) fail('CATALOG_ZIP_ENTRY_REQUIRED');
  if (value.backend !== undefined && !entries.get(STANDARD_BACKEND_ENTRY)?.length) fail('CATALOG_ZIP_ENTRY_REQUIRED');
  return Object.freeze({
    format: 'zip', raw, sha256: sha256(raw), metadata: structuredClone(value),
    identity: {
      id: value.id, version: value.version, name: structuredClone(value.name), description: structuredClone(value.description),
      author: value.author, license: value.license, permissions: [...value.permissions],
      compatibility: structuredClone(value.compatibility),
    },
    entries: [...entries.keys()].sort(),
  });
}
