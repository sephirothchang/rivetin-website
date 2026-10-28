import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { boundedFile, optionalBytes, exclusive, replace } from './catalog-files.mjs';
import { MAX_INDEX_BYTES, exact, fail, sha256, validHash, parseJson } from './catalog-contract.mjs';
import { RELEASE_PATH, RELEASE_LEDGER, MAX_RELEASE_BYTES, MAX_RELEASE_LEDGER_BYTES, encode, encodeReleaseLedger, emptyReleaseLedger, releaseLedger, reserveRelease, validateRelease, snapshotMetadata } from './catalog-release-contract.mjs';

export function publicationPlan(state,drop,publishedAt){
 if(!drop.releaseRequest){if(state.releaseRaw&&!state.v4Raw.equals(drop.indexRaw))fail('CATALOG_RELEASE_REQUEST_REQUIRED');return null;}
 if(drop.releaseRequest.baseReleaseSHA256!==(state.releaseRaw?sha256(state.releaseRaw):null))fail('CATALOG_RELEASE_BASE_CHANGED');
 const planned=reserveRelease(state.publications||emptyReleaseLedger(),drop.indexRaw,publishedAt);
 if(planned.reused)return {...planned,previousLedgerRaw:state.releaseLedgerRaw,previousSidecarRaw:state.releaseRaw};
 const committed=structuredClone(planned.ledger);committed.currentPublicationId=planned.record.publicationId;committed.releases.at(-1).status='local-committed';
 const abandoned=structuredClone(planned.ledger);abandoned.releases.at(-1).status='abandoned';
 return {...planned,requestSHA256:drop.releaseRequestHash,previousLedgerRaw:state.releaseLedgerRaw,previousSidecarRaw:state.releaseRaw,reservedLedgerRaw:encodeReleaseLedger(planned.ledger),committedLedgerRaw:encodeReleaseLedger(committed),abandonedLedgerRaw:encodeReleaseLedger(abandoned)};
}
export async function savePublication(journal,plan){
 if(!plan||plan.reused)return null;
 const save=async(name,raw)=>{if(raw===null)return null;await exclusive(journal,name,raw);return sha256(raw);};
 return {requestSHA256:plan.requestSHA256,publicationId:plan.record.publicationId,previousLedgerSHA256:await save('backup/catalog-release-ledger.json',plan.previousLedgerRaw),reservedLedgerSHA256:await save('candidate/catalog-release-reserved.json',plan.reservedLedgerRaw),committedLedgerSHA256:await save('candidate/catalog-release-committed.json',plan.committedLedgerRaw),abandonedLedgerSHA256:await save('candidate/catalog-release-abandoned.json',plan.abandonedLedgerRaw),previousSidecarSHA256:await save('backup/catalog/v4/release.json',plan.previousSidecarRaw),newSidecarSHA256:await save('candidate/catalog/v4/release.json',plan.metadataRaw)};
}
export async function reservePublication(siteRoot,plan){if(plan&&!plan.reused)await replace(siteRoot,RELEASE_LEDGER,plan.reservedLedgerRaw,plan.previousLedgerRaw,MAX_RELEASE_LEDGER_BYTES);}
export async function writePublicationSnapshots(publicRoot,plan,indexRaw,onPhase){
 if(!plan||plan.reused)return;
 await exclusive(publicRoot,plan.record.snapshotPath.slice(1),indexRaw);await onPhase('release-snapshot-index-written');
 await exclusive(publicRoot,snapshotMetadata(plan.record.publicationId).slice(1),plan.metadataRaw);await onPhase('release-snapshot-metadata-written');
}
export async function commitPublication(siteRoot,publicRoot,plan,onPhase){
 if(!plan||plan.reused)return;
 await replace(publicRoot,RELEASE_PATH.slice(1),plan.metadataRaw,plan.previousSidecarRaw);await onPhase('release-current-written');
 await replace(siteRoot,RELEASE_LEDGER,plan.committedLedgerRaw,plan.reservedLedgerRaw,MAX_RELEASE_LEDGER_BYTES);await onPhase('release-ledger-committed');
}
export async function readPublicationJournal({siteRoot,publicRoot,journal,manifest,indexRaw}){
 const m=manifest;if(!m)return null;
 if(!exact(m,['requestSHA256','publicationId','previousLedgerSHA256','reservedLedgerSHA256','committedLedgerSHA256','abandonedLedgerSHA256','previousSidecarSHA256','newSidecarSHA256'])||!validHash(m.requestSHA256)||!['previousLedgerSHA256','previousSidecarSHA256'].every(k=>m[k]===null||validHash(m[k]))||!['reservedLedgerSHA256','committedLedgerSHA256','abandonedLedgerSHA256','newSidecarSHA256'].every(k=>validHash(m[k])))fail('CATALOG_RELEASE_JOURNAL_INVALID');
 const read=async(name,hash,max)=>{if(hash===null)return null;const raw=await boundedFile(journal,name,max);if(sha256(raw)!==hash)fail('CATALOG_BACKUP_CHANGED');return raw;};
 const previousLedgerRaw=await read('backup/catalog-release-ledger.json',m.previousLedgerSHA256,MAX_RELEASE_LEDGER_BYTES),previousSidecarRaw=await read('backup/catalog/v4/release.json',m.previousSidecarSHA256,MAX_RELEASE_BYTES),metadataRaw=await read('candidate/catalog/v4/release.json',m.newSidecarSHA256,MAX_RELEASE_BYTES);
 const metadata=validateRelease(parseJson(metadataRaw,MAX_RELEASE_BYTES),indexRaw);if(metadata.publicationId!==m.publicationId)fail('CATALOG_RELEASE_JOURNAL_INVALID');
 const old=previousLedgerRaw?releaseLedger(parseJson(previousLedgerRaw,MAX_RELEASE_LEDGER_BYTES)):emptyReleaseLedger(),expected=reserveRelease(old,indexRaw,metadata.publishedAt);
 if(expected.reused||!same(expected.metadataRaw,metadataRaw))fail('CATALOG_RELEASE_JOURNAL_INVALID');
 const reservedLedgerRaw=await read('candidate/catalog-release-reserved.json',m.reservedLedgerSHA256,MAX_RELEASE_LEDGER_BYTES),committedLedgerRaw=await read('candidate/catalog-release-committed.json',m.committedLedgerSHA256,MAX_RELEASE_LEDGER_BYTES),abandonedLedgerRaw=await read('candidate/catalog-release-abandoned.json',m.abandonedLedgerSHA256,MAX_RELEASE_LEDGER_BYTES);
 const committed=structuredClone(expected.ledger);committed.currentPublicationId=metadata.publicationId;committed.releases.at(-1).status='local-committed';const abandoned=structuredClone(expected.ledger);abandoned.releases.at(-1).status='abandoned';
 if(!same(releaseLedger(parseJson(reservedLedgerRaw,MAX_RELEASE_LEDGER_BYTES)),expected.ledger)||!same(releaseLedger(parseJson(committedLedgerRaw,MAX_RELEASE_LEDGER_BYTES)),committed)||!same(releaseLedger(parseJson(abandonedLedgerRaw,MAX_RELEASE_LEDGER_BYTES)),abandoned))fail('CATALOG_RELEASE_JOURNAL_INVALID');
 const currentLedger=await optionalBytes(siteRoot,RELEASE_LEDGER,MAX_RELEASE_LEDGER_BYTES),currentSidecar=await optionalBytes(publicRoot,RELEASE_PATH.slice(1),MAX_RELEASE_BYTES);
 if(![previousLedgerRaw,reservedLedgerRaw,committedLedgerRaw,abandonedLedgerRaw].some(raw=>same(raw,currentLedger))||![previousSidecarRaw,metadataRaw].some(raw=>same(raw,currentSidecar)))fail('CATALOG_ROLLBACK_CONFLICT');
 for(const [name,raw,max] of [[metadata.snapshotPath.slice(1),indexRaw,MAX_INDEX_BYTES],[snapshotMetadata(metadata.publicationId).slice(1),metadataRaw,MAX_RELEASE_BYTES]]){const actual=await optionalBytes(publicRoot,name,max);if(actual&&!same(actual,raw))fail('CATALOG_ROLLBACK_CONFLICT');}
 return {metadata,metadataRaw,indexRaw,previousLedgerRaw,previousSidecarRaw,reservedLedgerRaw,committedLedgerRaw,abandonedLedgerRaw,currentLedger,currentSidecar};
}
export async function verifyPublicationCommit(siteRoot,publicRoot,p){
 if(!p)return;
 if(!same(await boundedFile(siteRoot,RELEASE_LEDGER,MAX_RELEASE_LEDGER_BYTES),p.committedLedgerRaw)||!same(await boundedFile(publicRoot,RELEASE_PATH.slice(1),MAX_RELEASE_BYTES),p.metadataRaw)||!same(await boundedFile(publicRoot,p.metadata.snapshotPath.slice(1),MAX_INDEX_BYTES),p.indexRaw)||!same(await boundedFile(publicRoot,snapshotMetadata(p.metadata.publicationId).slice(1),MAX_RELEASE_BYTES),p.metadataRaw))fail('CATALOG_ROLLBACK_CONFLICT');
}
export async function rollbackPublication(siteRoot,publicRoot,p,onPhase){
 if(!p)return;
 const remove=async(name,expected,max)=>{const raw=await optionalBytes(publicRoot,name,max);if(raw){if(!same(raw,expected))fail('CATALOG_ROLLBACK_CONFLICT');await unlink(path.join(publicRoot,name));}};
 const current=await optionalBytes(publicRoot,RELEASE_PATH.slice(1),MAX_RELEASE_BYTES);
 if(!same(current,p.previousSidecarRaw)){if(p.previousSidecarRaw)await replace(publicRoot,RELEASE_PATH.slice(1),p.previousSidecarRaw,p.metadataRaw);else await remove(RELEASE_PATH.slice(1),p.metadataRaw,MAX_RELEASE_BYTES);}
 await onPhase('release-current-restored');
 await remove(p.metadata.snapshotPath.slice(1),p.indexRaw,MAX_INDEX_BYTES);await remove(snapshotMetadata(p.metadata.publicationId).slice(1),p.metadataRaw,MAX_RELEASE_BYTES);await onPhase('release-uncommitted-snapshots-removed');
 const ledger=await optionalBytes(siteRoot,RELEASE_LEDGER,MAX_RELEASE_LEDGER_BYTES);if(![p.previousLedgerRaw,p.reservedLedgerRaw,p.committedLedgerRaw,p.abandonedLedgerRaw].some(raw=>same(raw,ledger)))fail('CATALOG_ROLLBACK_CONFLICT');if(!same(ledger,p.abandonedLedgerRaw))await replace(siteRoot,RELEASE_LEDGER,p.abandonedLedgerRaw,ledger,MAX_RELEASE_LEDGER_BYTES);await onPhase('release-reservation-abandoned');
}
export function publicationOutput(plan,drop){
 const descriptor=(path,raw)=>({path,sha256:sha256(raw),bytes:raw.length});
 return {schemaVersion:1,requestId:drop.releaseRequest.requestId,stageSHA256:sha256(drop.stageRaw),releaseRequestSHA256:drop.releaseRequestHash,publicationId:plan.record.publicationId,publicationState:'local-committed',files:[descriptor(drop.stage.indexPath,drop.indexRaw),descriptor(RELEASE_PATH,plan.metadataRaw),descriptor(plan.record.snapshotPath,drop.indexRaw),descriptor(snapshotMetadata(plan.record.publicationId),plan.metadataRaw)],ledger:descriptor(RELEASE_LEDGER,plan.committedLedgerRaw),packages:drop.packages};
}
