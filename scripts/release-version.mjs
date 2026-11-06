const versionPattern = /^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})(?:-(beta|alpha\.([1-9]\d{0,15})(?:\.trial\.([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\.([1-9]\d{0,15}))?))?$/u;

export function parseReleaseVersion(version) {
  if (typeof version !== 'string' || version.length > 100 || version !== version.trim()) return null;
  const match = versionPattern.exec(version);
  if (!match || (match[6]?.length ?? 0) > 24) return null;
  const [, major, minor, patch, prerelease, alpha, trial, iteration] = match;
  return {
    core: [major, minor, patch].map(Number),
    stage: alpha ? 0 : prerelease === 'beta' ? 1 : 2,
    alpha: BigInt(alpha ?? 0),
    trial: trial ?? '',
    iteration: BigInt(iteration ?? 0),
  };
}

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function compareReleaseVersions(left, right) {
  const a = parseReleaseVersion(left), b = parseReleaseVersion(right);
  if (!a || !b) throw new TypeError('Invalid Rivetin release version');
  return compare(a.core[0], b.core[0]) || compare(a.core[1], b.core[1]) ||
    compare(a.core[2], b.core[2]) || compare(a.stage, b.stage) ||
    compare(a.alpha, b.alpha) || compare(a.trial, b.trial) || compare(a.iteration, b.iteration);
}
