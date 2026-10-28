import { compareVersions, validVersion } from '../scripts/catalog-contract.mjs';

const published = catalog => catalog?.plugins.filter(item => item.status === 'published') ?? [];

export function catalogSummary(state) {
  const legacy = published(state.catalog), current = published(state.v4Catalog);
  return {
    v3: legacy.length,
    v4: current.length,
    uniqueExtensions: new Set([...legacy, ...current].map(item => item.id)).size,
  };
}

export function selectPluginReleases(id, state, frameworkVersion) {
  const currentRelease = published(state.v4Catalog).find(item => item.id === id) ?? null;
  const legacyRelease = published(state.catalog).find(item => item.id === id) ?? null;
  const compatibility = currentRelease?.compatibility;
  const currentCompatible = Boolean(compatibility?.schemaVersion === 2 &&
    validVersion(frameworkVersion) && validVersion(compatibility.frameworkMinVersion) &&
    validVersion(compatibility.frameworkMaxVersionExclusive) &&
    compareVersions(frameworkVersion, compatibility.frameworkMinVersion) >= 0 &&
    compareVersions(frameworkVersion, compatibility.frameworkMaxVersionExclusive) < 0);
  // An old declaration never becomes the primary 0.2 download by fallback.
  return { currentRelease, legacyRelease, release: currentCompatible ? currentRelease : null };
}

export function catalogMetadata(id, state) {
  const metadata = catalog => {
    const item = catalog?.plugins.find(entry => entry.id === id);
    return item ? { version: item.version, status: item.status } : null;
  };
  return { v4: metadata(state.v4Catalog), v3: metadata(state.catalog) };
}
