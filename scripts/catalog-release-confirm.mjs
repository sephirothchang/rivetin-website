import {open,mkdir,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {boundedFile,optionalBytes,optionalStat,exclusive,replace,safePath,publicCatalogState} from './catalog-files.mjs';
import {exact,fail,sha256,validHash,parseJson} from './catalog-contract.mjs';
import {RELEASE_LEDGER,MAX_RELEASE_LEDGER_BYTES,releaseLedger,encode,encodeReleaseLedger,validatePublicationOutput,validReleaseTime} from './catalog-release-contract.mjs';
import {frozenPublicationOutput,verifyReleaseProof} from './catalog-release-readback.mjs';
import {CATALOG_LOCK,acquireOwner,releaseOwner} from './catalog-publisher-lock.mjs';

async function event(journal,name){const before=await optionalBytes(journal,'events.ndjson',256*1024),line=Buffer.from(JSON.stringify({event:name,at:new Date().toISOString()})+'\n');await replace(journal,'events.ndjson',before?Buffer.concat([before,line]):line,before);}
export async function recoverConfirmationOwned({siteRoot,journal,transactionId,manifest:m,onPhase=async()=>{}}){
 if(!exact(m,['schemaVersion','kind','id','publicationId','beforeLedgerSHA256','afterLedgerSHA256','outputSHA256','proofSHA256','verifiedAt'])||m.schemaVersion!==1||m.kind!=='release-confirmation'||m.id!==transactionId||!['beforeLedgerSHA256','afterLedgerSHA256','outputSHA256','proofSHA256'].every(k=>validHash(m[k]))||!validReleaseTime(m.verifiedAt))fail('CATALOG_RELEASE_CONFIRM_JOURNAL_INVALID');
 const load=async(name,hash,max)=>{const raw=await boundedFile(journal,name,max);if(sha256(raw)!==hash)fail('CATALOG_BACKUP_CHANGED');return raw;};
 const before=await load('backup/catalog-release-ledger.json',m.beforeLedgerSHA256,MAX_RELEASE_LEDGER_BYTES),after=await load('candidate/catalog-release-ledger.json',m.afterLedgerSHA256,MAX_RELEASE_LEDGER_BYTES),output=validatePublicationOutput(parseJson(await load('publication-output.json',m.outputSHA256,256*1024),256*1024));
 const proof=parseJson(await load('verification.json',m.proofSHA256,16384),16384);if(!exact(proof,['publicationId','verifiedAt','httpsVerified'])||proof.publicationId!==m.publicationId||proof.verifiedAt!==m.verifiedAt||proof.httpsVerified!==true)fail('CATALOG_RELEASE_CONFIRM_JOURNAL_INVALID');
 const expected=structuredClone(releaseLedger(parseJson(before,MAX_RELEASE_LEDGER_BYTES))),record=expected.releases.find(r=>r.publicationId===m.publicationId);
 if(!record||record.status!=='local-committed'||expected.currentPublicationId!==m.publicationId||output.publicationId!==record.publicationId||output.files[0].sha256!==record.catalogSHA256||output.files[1].sha256!==record.metadataSHA256)fail('CATALOG_RELEASE_CONFIRM_JOURNAL_INVALID');record.status='verified';record.verifiedAt=m.verifiedAt;
 if(!same(releaseLedger(parseJson(after,MAX_RELEASE_LEDGER_BYTES)),expected))fail('CATALOG_RELEASE_CONFIRM_JOURNAL_INVALID');
 const current=await boundedFile(siteRoot,RELEASE_LEDGER,MAX_RELEASE_LEDGER_BYTES);if(!same(current,before)&&!same(current,after))fail('CATALOG_ROLLBACK_CONFLICT');
 await publicCatalogState(siteRoot,{allowLocked:true});
 const events=(await boundedFile(journal,'events.ndjson',256*1024)).toString('utf8').trim().split('\n').map(s=>JSON.parse(s));if(events.some(e=>!exact(e,['event','at'])||!['prepared','confirmed','rolled-back','reconciled-confirmed'].includes(e.event)||!validReleaseTime(e.at)))fail('CATALOG_RELEASE_CONFIRM_JOURNAL_INVALID');
 if(events.some(e=>e.event==='confirmed')){if(!same(current,after))fail('CATALOG_ROLLBACK_CONFLICT');await event(journal,'reconciled-confirmed');return {result:'confirmed-online-verification',transactionId,publicationId:m.publicationId};}
 if(!same(current,before))await replace(siteRoot,RELEASE_LEDGER,before,after,MAX_RELEASE_LEDGER_BYTES);await onPhase('confirmation-ledger-restored');await event(journal,'rolled-back');return {result:'verification-rolled-back',transactionId,publicationId:m.publicationId};
}
export async function confirmRelease(options){
 const {drop,manifest,raw:outputRaw}=await frozenPublicationOutput(options),proof=await verifyReleaseProof({manifest,proofRoot:options.proofRoot,notBefore:drop.stage.preparedAt,now:options.now??Date.now()}),siteRoot=options.siteRoot,onPhase=options.onPhase||(async()=>{}),local=path.join(siteRoot,'.local'),id=randomUUID();
 await safePath(siteRoot,'.local',{directory:true});const owner=await acquireOwner(local);let lock;
 try{lock=await open(path.join(local,CATALOG_LOCK),'wx',0o600).catch(e=>{if(e.code==='EEXIST')fail('CATALOG_IMPORT_LOCKED');throw e;});}catch(e){await releaseOwner(local,owner);throw e;}
 let release=true,prepared=false,journal,m;
 try{
  await lock.writeFile(encode({schemaVersion:1,id,manifestSHA256:null}));await lock.sync();
  const state=await publicCatalogState(siteRoot,{allowLocked:true}),record=state.publications.releases.find(r=>r.publicationId===manifest.publicationId);
  if(!record||state.publications.currentPublicationId!==manifest.publicationId||sha256(state.releaseRaw)!==manifest.files[1].sha256||sha256(state.v4Raw)!==manifest.files[0].sha256)fail('CATALOG_RELEASE_CONFIRM_BASE_CHANGED');
  if(record.status==='verified')return {result:'already-online-verified',publicationId:record.publicationId,verifiedAt:record.verifiedAt};
  const next=structuredClone(state.publications),updated=next.releases.find(r=>r.publicationId===record.publicationId);updated.status='verified';updated.verifiedAt=proof.verifiedAt;const after=encodeReleaseLedger(next);
  const parent=path.join(local,'catalog-v4-transactions');await mkdir(parent,{recursive:true});await safePath(local,'catalog-v4-transactions',{directory:true});journal=path.join(parent,id);await mkdir(journal);
  await exclusive(journal,'backup/catalog-release-ledger.json',state.releaseLedgerRaw);await exclusive(journal,'candidate/catalog-release-ledger.json',after);await exclusive(journal,'publication-output.json',outputRaw);
  const proofRaw=encode({publicationId:record.publicationId,verifiedAt:proof.verifiedAt,httpsVerified:true});await exclusive(journal,'verification.json',proofRaw);
  m={schemaVersion:1,kind:'release-confirmation',id,publicationId:record.publicationId,beforeLedgerSHA256:sha256(state.releaseLedgerRaw),afterLedgerSHA256:sha256(after),outputSHA256:sha256(outputRaw),proofSHA256:sha256(proofRaw),verifiedAt:proof.verifiedAt};const mRaw=encode(m);await exclusive(journal,'manifest.json',mRaw);await event(journal,'prepared');const anchor=encode({schemaVersion:1,id,manifestSHA256:sha256(mRaw)});await lock.truncate(0);await lock.write(anchor,0,anchor.length,0);await lock.sync();prepared=true;await onPhase('confirmation-prepared');
  await replace(siteRoot,RELEASE_LEDGER,after,state.releaseLedgerRaw,MAX_RELEASE_LEDGER_BYTES);await onPhase('confirmation-ledger-written');await publicCatalogState(siteRoot,{allowLocked:true});await event(journal,'confirmed');await onPhase('confirmation-committed');return {result:'online-verified',publicationId:record.publicationId,verifiedAt:proof.verifiedAt,transactionId:id,journal};
 }catch(e){if(prepared){release=false;if(e.code==='CATALOG_SIMULATED_CRASH')throw e;try{await recoverConfirmationOwned({siteRoot,journal,transactionId:id,manifest:m});release=true;}catch(cause){throw Object.assign(Error('CATALOG_OUTCOME_UNKNOWN'),{transactionId:id,cause});}}throw e;}
 finally{try{await lock.close();if(release)await unlink(path.join(local,CATALOG_LOCK));}finally{await releaseOwner(local,owner);}}
}
async function main(args){
 const map={'--drop':'dropRoot','--stage-sha256':'stageHash','--base-sha256':'baseHash','--release-request-sha256':'releaseRequestHash','--publication-output':'publicationOutputFile','--publication-output-sha256':'publicationOutputHash','--proof':'proofRoot'},values={};
 for(let i=0;i<args.length;i++){const key=map[args[i]];if(!key||values[key]||!args[i+1]||args[i+1].startsWith('--'))fail('CATALOG_ARGUMENT_INVALID');values[key]=args[++i];}if(Object.keys(values).length!==7)fail('CATALOG_ARGUMENT_INVALID');console.log(JSON.stringify(await confirmRelease({...values,siteRoot:fileURLToPath(new URL('../',import.meta.url))})));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(e=>{console.error(JSON.stringify({error:/^[A-Z][A-Z0-9_]+$/u.test(e.code||'')?e.code:'CATALOG_RELEASE_CONFIRM_FAILED',transactionId:e.transactionId||null}));process.exitCode=1;});
