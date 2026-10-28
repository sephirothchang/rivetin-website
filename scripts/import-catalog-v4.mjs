import { constants } from 'node:fs';
import { open, mkdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundedFile, optionalBytes, optionalStat, safePath, publicCatalogState, ledger, exclusive, replace } from './catalog-files.mjs';
import { INDEX_PATH, MAX_INDEX_BYTES, MAX_PACKAGE_BYTES, exact, fail, sha256, validHash, parsePackagePath, parseJson, compareVersions } from './catalog-contract.mjs';
import { V4_INDEX_PATH, validateV4Package, validateV4Transition } from './catalog-v4-contract.mjs';
import { frozenV4Drop } from './catalog-v4-staging.mjs';
import { publicationPlan,savePublication,reservePublication,writePublicationSnapshots,commitPublication,readPublicationJournal,verifyPublicationCommit,rollbackPublication,publicationOutput } from './catalog-release-files.mjs';
import { CATALOG_LOCK,acquireOwner,releaseOwner } from './catalog-publisher-lock.mjs';
import { recoverConfirmationOwned } from './catalog-release-confirm.mjs';

const LOCK=CATALOG_LOCK,LEDGER='catalog-integrity.json';
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
async function event(root,name){
  const exists=await optionalStat(path.join(root,'events.ndjson'));
  const target=await safePath(root,'events.ndjson',{missing:!exists});
  const flags=constants.O_WRONLY|constants.O_APPEND|(exists?0:constants.O_CREAT|constants.O_EXCL)|(constants.O_NOFOLLOW||0);
  const file=await open(target,flags,0o600);try{await file.writeFile(JSON.stringify({event:name,at:new Date().toISOString()})+'\n');await file.sync();}finally{await file.close();}
}
async function snapshot(root,name,bytes){await exclusive(root,name,bytes);return sha256(bytes);}
async function checkBytes(root,name,hash,max){const bytes=await boundedFile(root,name,max);if(!validHash(hash)||sha256(bytes)!==hash)fail('CATALOG_BACKUP_CHANGED');return bytes;}
const same=(a,b)=>isDeepStrictEqual(a,b);

// Recovery changes only exact files whose bytes match this transaction's before
// or after snapshots. Any conflicting edit keeps the lock for manual review.
export async function recoverV4({siteRoot,transactionId,onPhase=async()=>{}}){
  const local=path.join(siteRoot,'.local');await safePath(siteRoot,'.local',{directory:true});
  const owner=await acquireOwner(local);
  let completed=false;
  try{const result=await recoverOwned({siteRoot,transactionId,onPhase});completed=true;return result;}finally{try{if(completed)await unlink(path.join(local,LOCK));}finally{await releaseOwner(local,owner);}}
}
async function recoverOwned({siteRoot,transactionId,onPhase=async()=>{}}){
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(transactionId))fail('CATALOG_TRANSACTION_INVALID');
  const local=path.join(siteRoot,'.local'),journal=path.join(local,'catalog-v4-transactions',transactionId),publicRoot=path.join(siteRoot,'public');
  await safePath(siteRoot,'.local',{directory:true});await safePath(local,`catalog-v4-transactions/${transactionId}`,{directory:true});
  const lock=parseJson(await boundedFile(local,LOCK,4096),4096);
  if(!exact(lock,['schemaVersion','id','manifestSHA256'])||lock.schemaVersion!==1||lock.id!==transactionId||!validHash(lock.manifestSHA256))fail('CATALOG_LOCK_MISMATCH');
  const manifestRaw=await boundedFile(journal,'manifest.json',MAX_INDEX_BYTES);if(sha256(manifestRaw)!==lock.manifestSHA256)fail('CATALOG_BACKUP_CHANGED');
  const m=parseJson(manifestRaw,MAX_INDEX_BYTES);
  if(m.kind==='release-confirmation')return recoverConfirmationOwned({siteRoot,journal,transactionId,manifest:m,onPhase});
  const journalFields=['schemaVersion','id','stageSHA256','v3SHA256','previousV4SHA256','previousLedgerSHA256','newV4SHA256','newLedgerSHA256','oldPackages','newPackages'];
  if(!(exact(m,journalFields)||exact(m,[...journalFields,'publication']))||m.schemaVersion!==1||m.id!==transactionId||!validHash(m.stageSHA256)||!Array.isArray(m.oldPackages)||!Array.isArray(m.newPackages))fail('CATALOG_JOURNAL_INVALID');
  const oldV3=await checkBytes(journal,'backup/catalog/plugins.json',m.v3SHA256,MAX_INDEX_BYTES);
  const oldLedger=await checkBytes(journal,'backup/catalog-integrity.json',m.previousLedgerSHA256,MAX_INDEX_BYTES);
  const newLedger=await checkBytes(journal,'candidate/catalog-integrity.json',m.newLedgerSHA256,MAX_INDEX_BYTES);
  const newV4=await checkBytes(journal,'candidate/catalog/v4/plugins.json',m.newV4SHA256,MAX_INDEX_BYTES);
  const oldV4=m.previousV4SHA256===null?null:await checkBytes(journal,'backup/catalog/v4/plugins.json',m.previousV4SHA256,MAX_INDEX_BYTES);
  const publication=await readPublicationJournal({siteRoot,publicRoot,journal,manifest:m.publication,indexRaw:newV4});
  const oldRecords=ledger(parseJson(oldLedger,MAX_INDEX_BYTES)).packages;
  if(!same(oldRecords,m.oldPackages))fail('CATALOG_BACKUP_CHANGED');
  const expectedNew=ledger(parseJson(newLedger,MAX_INDEX_BYTES)).packages;
  for(const record of m.newPackages){
    if(!exact(record,['path','sha256','bytes'])||!validHash(record.sha256)||!Number.isSafeInteger(record.bytes)||record.bytes<1||record.bytes>MAX_PACKAGE_BYTES)fail('CATALOG_JOURNAL_INVALID');
    parsePackagePath(record.path);if(oldRecords.some(p=>p.path===record.path)||!expectedNew.some(p=>same(p,record)))fail('CATALOG_JOURNAL_INVALID');
    const saved=await checkBytes(journal,'candidate'+record.path,record.sha256,MAX_PACKAGE_BYTES);if(saved.length!==record.bytes)fail('CATALOG_BACKUP_CHANGED');
  }
  if(expectedNew.length!==oldRecords.length+m.newPackages.length||oldRecords.some(p=>!expectedNew.some(q=>same(p,q))))fail('CATALOG_JOURNAL_INVALID');
  if(!same(await boundedFile(publicRoot,INDEX_PATH.slice(1),MAX_INDEX_BYTES),oldV3))fail('CATALOG_ROLLBACK_CONFLICT');
  for(const record of oldRecords){const saved=await checkBytes(journal,'backup'+record.path,record.sha256,MAX_PACKAGE_BYTES);const actual=await boundedFile(publicRoot,record.path.slice(1),MAX_PACKAGE_BYTES);if(saved.length!==record.bytes||!same(saved,actual))fail('CATALOG_ROLLBACK_CONFLICT');}
  const currentV4=await optionalBytes(publicRoot,V4_INDEX_PATH.slice(1),MAX_INDEX_BYTES),currentLedger=await boundedFile(siteRoot,LEDGER,MAX_INDEX_BYTES);
  if(!same(currentV4,oldV4)&&!same(currentV4,newV4)||!same(currentLedger,oldLedger)&&!same(currentLedger,newLedger))fail('CATALOG_ROLLBACK_CONFLICT');
  for(const record of m.newPackages){const actual=await optionalBytes(publicRoot,record.path.slice(1),MAX_PACKAGE_BYTES);if(actual&&(actual.length!==record.bytes||sha256(actual)!==record.sha256))fail('CATALOG_ROLLBACK_CONFLICT');}
  const eventRaw=await boundedFile(journal,'events.ndjson',256*1024);let events;
  try{events=eventRaw.toString('utf8').trim().split('\n').map(line=>JSON.parse(line));}catch{fail('CATALOG_JOURNAL_INVALID');}
  if(events.some(item=>!exact(item,['event','at'])||!['prepared','committed','rolled-back','reconciled-committed'].includes(item.event)||typeof item.at!=='string'))fail('CATALOG_JOURNAL_INVALID');
  if(events.some(item=>item.event==='committed')){
    if(!same(currentV4,newV4)||!same(currentLedger,newLedger))fail('CATALOG_ROLLBACK_CONFLICT');
    for(const record of m.newPackages)if(!await optionalBytes(publicRoot,record.path.slice(1),MAX_PACKAGE_BYTES))fail('CATALOG_ROLLBACK_CONFLICT');
    await verifyPublicationCommit(siteRoot,publicRoot,publication);
    await publicCatalogState(siteRoot,{allowLocked:true});await event(journal,'reconciled-committed');
    return {result:'confirmed-committed',transactionId,journal};
  }
  if(!same(currentV4,oldV4)){
    if(oldV4)await replace(publicRoot,V4_INDEX_PATH.slice(1),oldV4,newV4);
    else{if(!same(await boundedFile(publicRoot,V4_INDEX_PATH.slice(1),MAX_INDEX_BYTES),newV4))fail('CATALOG_ROLLBACK_CONFLICT');await unlink(path.join(publicRoot,V4_INDEX_PATH.slice(1)));}
  }
  await onPhase('index-restored');
  await rollbackPublication(siteRoot,publicRoot,publication,onPhase);
  if(!same(currentLedger,oldLedger))await replace(siteRoot,LEDGER,oldLedger,newLedger);
  await onPhase('ledger-restored');
  for(const record of m.newPackages){const actual=await optionalBytes(publicRoot,record.path.slice(1),MAX_PACKAGE_BYTES);if(actual){if(sha256(actual)!==record.sha256)fail('CATALOG_ROLLBACK_CONFLICT');await unlink(path.join(publicRoot,record.path.slice(1)));}}
  await onPhase('packages-removed');
  await publicCatalogState(siteRoot,{allowLocked:true});await event(journal,'rolled-back');
  return {result:'rolled-back',transactionId,journal};
}

export async function importV4({siteRoot,dropRoot,stageHash,baseHash,check=false,onPhase=async()=>{},releaseRequestHash=null,publishedAt=new Date().toISOString()}){
  const drop=await frozenV4Drop(dropRoot,stageHash,baseHash,releaseRequestHash);await safePath(siteRoot,'scripts',{directory:true});
  const local=path.join(siteRoot,'.local'),transactionId=drop.releaseRequest?.requestId||randomUUID();
  const localInfo=await optionalStat(local);if(localInfo?.isSymbolicLink())fail('CATALOG_PATH_INVALID');await mkdir(local,{recursive:true});await safePath(siteRoot,'.local',{directory:true});
  const owner=await acquireOwner(local);
  let lock;
  try{lock=await open(path.join(local,LOCK),'wx',0o600).catch(error=>{if(error.code==='EEXIST')fail('CATALOG_IMPORT_LOCKED');throw error;});}catch(error){await releaseOwner(local,owner);throw error;}
  let release=true,prepared=false,journal;
  try{
    await lock.writeFile(encode({schemaVersion:1,id:transactionId,manifestSHA256:null}));await lock.sync();await onPhase('lock-initialized');
    if(drop.releaseRequest&&await optionalStat(path.join(local,'catalog-v4-transactions',transactionId))){
      const prior=path.join(local,'catalog-v4-transactions',transactionId),raw=await boundedFile(prior,'manifest.json',MAX_INDEX_BYTES),m=parseJson(raw,MAX_INDEX_BYTES);
      if(m.id!==transactionId||m.stageSHA256!==stageHash||m.publication?.requestSHA256!==releaseRequestHash)fail('CATALOG_RELEASE_REQUEST_REUSED');
      const events=(await boundedFile(prior,'events.ndjson',256*1024)).toString('utf8').trim().split('\n').map(line=>JSON.parse(line));
      if(events.some(e=>e.event==='committed')){
        const state=await publicCatalogState(siteRoot,{allowLocked:true}),record=state.publications.releases.find(r=>r.publicationId===m.publication.publicationId);
        if(!record||!['local-committed','verified'].includes(record.status)||record.catalogSHA256!==m.newV4SHA256||record.metadataSHA256!==m.publication.newSidecarSHA256)fail('CATALOG_RELEASE_OUTCOME_UNKNOWN');
        return {result:'already-local-committed',transactionId,journal:prior,publicationId:record.publicationId,current:state.publications.currentPublicationId===record.publicationId};
      }
      if(events.some(e=>e.event==='rolled-back'))fail('CATALOG_RELEASE_REQUEST_ABANDONED');
      const anchor=encode({schemaVersion:1,id:transactionId,manifestSHA256:sha256(raw)});await lock.truncate(0);await lock.write(anchor,0,anchor.length,0);await lock.sync();release=false;fail('CATALOG_RELEASE_OUTCOME_UNKNOWN');
    }
    const state=await publicCatalogState(siteRoot,{allowLocked:true});if(!state.catalog)fail('CATALOG_V3_REQUIRED');
    if(state.v4Raw&&sha256(state.v4Raw)!==baseHash&&!same(state.v4Raw,drop.indexRaw))fail('CATALOG_V4_BASE_CHANGED');
    if(state.v4Catalog)validateV4Transition(state.v4Catalog,drop.catalog);
    const combined=new Map(state.packages.map(p=>[p.path,p]));
    for(const record of drop.packages){const old=combined.get(record.path);if(old&&!same(old,record))fail('CATALOG_SAME_VERSION_IMMUTABLE');combined.set(record.path,record);}
    const packages=ledger({schemaVersion:1,packages:[...combined.values()].sort((a,b)=>a.path.localeCompare(b.path,'en'))}).packages;
    for(const entry of drop.catalog.plugins.filter(x=>x.status==='published')){
      const record=combined.get(entry.downloadPath);if(!record||record.sha256!==entry.sha256)fail('CATALOG_PUBLISHED_FILE_MISSING');
      if(state.packages.map(old=>parsePackagePath(old.path)).some(old=>old.id===entry.id&&compareVersions(entry.version,old.version)<0))fail('CATALOG_VERSION_DOWNGRADE');
      if(!drop.packages.some(x=>x.path===entry.downloadPath))validateV4Package(await boundedFile(state.publicRoot,entry.downloadPath.slice(1),MAX_PACKAGE_BYTES),entry);
    }
    const newPackages=drop.packages.filter(p=>!state.packages.some(old=>old.path===p.path));
    const publication=publicationPlan(state,drop,publishedAt);
    if(check)return {result:'checked',transactionId:null,published:drop.catalog.plugins.filter(x=>x.status==='published').length,added:newPackages.length};
    if(publication?.reused)return {result:'unchanged',transactionId:null,publicationId:publication.record.publicationId,published:drop.catalog.plugins.filter(x=>x.status==='published').length,added:0};
    const txRoot=path.join(local,'catalog-v4-transactions');await mkdir(txRoot,{recursive:true});await safePath(local,'catalog-v4-transactions',{directory:true});
    journal=path.join(txRoot,transactionId);await mkdir(journal);
    const newLedger=encode({schemaVersion:1,packages});
    const manifest={schemaVersion:1,id:transactionId,stageSHA256:stageHash,v3SHA256:await snapshot(journal,'backup/catalog/plugins.json',state.indexRaw),previousV4SHA256:state.v4Raw?await snapshot(journal,'backup/catalog/v4/plugins.json',state.v4Raw):null,previousLedgerSHA256:await snapshot(journal,'backup/catalog-integrity.json',state.ledgerRaw),newV4SHA256:await snapshot(journal,'candidate/catalog/v4/plugins.json',drop.indexRaw),newLedgerSHA256:await snapshot(journal,'candidate/catalog-integrity.json',newLedger),oldPackages:state.packages,newPackages};
    if(publication)manifest.publication=await savePublication(journal,publication);
    for(const record of state.packages)await snapshot(journal,'backup'+record.path,await boundedFile(state.publicRoot,record.path.slice(1),MAX_PACKAGE_BYTES));
    for(const record of newPackages){const raw=await boundedFile(dropRoot,record.path.slice(1),MAX_PACKAGE_BYTES);if(raw.length!==record.bytes||sha256(raw)!==record.sha256)fail('CATALOG_INPUT_CHANGED');await snapshot(journal,'candidate'+record.path,raw);}
    const manifestRaw=encode(manifest);await snapshot(journal,'manifest.json',manifestRaw);await event(journal,'prepared');
    const lockData=encode({schemaVersion:1,id:transactionId,manifestSHA256:sha256(manifestRaw)});await lock.truncate(0);await lock.write(lockData,0,lockData.length,0);await lock.sync();prepared=true;
    await onPhase('prepared');
    await reservePublication(siteRoot,publication);if(publication)await onPhase('release-reserved');
    for(const record of newPackages){await exclusive(state.publicRoot,record.path.slice(1),await boundedFile(journal,'candidate'+record.path,MAX_PACKAGE_BYTES));await onPhase('package-written');}
    await replace(siteRoot,LEDGER,newLedger,state.ledgerRaw);await onPhase('ledger-written');
    await writePublicationSnapshots(state.publicRoot,publication,drop.indexRaw,onPhase);
    await replace(state.publicRoot,V4_INDEX_PATH.slice(1),drop.indexRaw,state.v4Raw??null);await onPhase('index-written');
    await commitPublication(siteRoot,state.publicRoot,publication,onPhase);
    const final=await publicCatalogState(siteRoot,{allowLocked:true});if(!same(final.indexRaw,state.indexRaw)||!same(final.v4Raw,drop.indexRaw)||!same(final.ledgerRaw,newLedger))fail('CATALOG_VERIFY_FAILED');
    let publicationResult={};if(publication){const raw=encode(publicationOutput(publication,drop));await exclusive(journal,'publication-output.json',raw);publicationResult={publicationId:publication.record.publicationId,publicationState:'local-committed',outputManifest:path.join(journal,'publication-output.json'),outputManifestSHA256:sha256(raw)};}
    await event(journal,'committed');await onPhase('committed');return {result:'committed',transactionId,journal,published:drop.catalog.plugins.filter(x=>x.status==='published').length,added:newPackages.length,...publicationResult};
  }catch(error){
    if(prepared){
      release=false;
      if(error.code==='CATALOG_SIMULATED_CRASH')throw error;
      try{await recoverOwned({siteRoot,transactionId});release=true;await onPhase('rollback-complete');}catch(recoveryError){throw Object.assign(new Error('CATALOG_OUTCOME_UNKNOWN'),{transactionId,cause:recoveryError});}
    }
    throw error;
  }finally{await lock.close();if(release)await unlink(path.join(local,LOCK)).catch(error=>{if(error.code!=='ENOENT')throw Object.assign(new Error(prepared?'CATALOG_OUTCOME_UNKNOWN':'CATALOG_LOCK_RELEASE_FAILED'),{transactionId,cause:error});});await releaseOwner(local,owner);}
}

async function main(args){
  if(args[0]==='recover'&&args.length===3&&args[1]==='--transaction')return console.log(JSON.stringify(await recoverV4({siteRoot:fileURLToPath(new URL('../',import.meta.url)),transactionId:args[2]})));
  const values={};let check=false;
  for(let i=0;i<args.length;i++){const key=args[i];if(key==='--check'&&!check){check=true;continue;}if(!['--drop','--stage-sha256','--base-sha256','--release-request-sha256'].includes(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))fail('CATALOG_ARGUMENT_INVALID');values[key]=args[++i];}
  if(!values['--drop']||!values['--stage-sha256']||!values['--base-sha256'])fail('CATALOG_ARGUMENT_INVALID');
  console.log(JSON.stringify(await importV4({siteRoot:fileURLToPath(new URL('../',import.meta.url)),dropRoot:values['--drop'],stageHash:values['--stage-sha256'],baseHash:values['--base-sha256'],releaseRequestHash:values['--release-request-sha256']||null,check})));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(JSON.stringify({error:/^[A-Z][A-Z0-9_]+$/u.test(error.message)?error.message:'CATALOG_V4_IMPORT_FAILED',transactionId:error.transactionId??null}));process.exitCode=1;});
