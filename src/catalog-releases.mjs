import { validSchema2Minimum } from '../scripts/catalog-contract.mjs';
import { validateRelease, validReleaseTime } from '../scripts/catalog-release-contract.mjs';
import { compareReleaseVersions, parseReleaseVersion } from '../scripts/release-version.mjs';

const published = catalog => catalog?.plugins.filter(item => item.status === 'published') ?? [];

export function catalogSummary(state) {
  return { v4: published(state.v4Catalog).length };
}

export function selectPluginReleases(id, state, frameworkVersion) {
  const currentRelease = published(state.v4Catalog).find(item => item.id === id) ?? null;
  const compatibility = currentRelease?.compatibility;
  const currentCompatible = Boolean(compatibility?.schemaVersion === 2 &&
    compatibility.frameworkApi === 1 && parseReleaseVersion(frameworkVersion) && validSchema2Minimum(compatibility) &&
    compareReleaseVersions(frameworkVersion, compatibility.frameworkMinVersion) >= 0);
  return { currentRelease, release: currentCompatible ? currentRelease : null };
}

export function catalogMetadata(id, state) {
  const item = state.v4Catalog?.plugins.find(entry => entry.id === id);
  return { v4: item ? { version: item.version, status: item.status } : null };
}
export function catalogReleaseIdentity(state){
  if(!state.releaseMetadata)return {status:'unregistered',publicationId:null};
  try{
    const metadata=validateRelease(state.releaseMetadata,state.v4Raw),record=state.publications?.releases.find(r=>r.publicationId===metadata.publicationId);
    if(!record||state.publications.currentPublicationId!==record.publicationId||!['local-committed','verified'].includes(record.status)||record.catalogSHA256!==metadata.catalogSHA256||record.catalogBytes!==metadata.catalogBytes)throw Error('unbound');
    return {status:'registered',publicationId:metadata.publicationId,publicationState:record.status,verifiedAt:record.verifiedAt};
  }catch{return {status:'unverified',publicationId:null};}
}
export function catalogReadbackDate(identity) {
  if (identity?.status !== 'registered' || identity.publicationState !== 'verified' || !validReleaseTime(identity.verifiedAt)) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(identity.verifiedAt));
}
