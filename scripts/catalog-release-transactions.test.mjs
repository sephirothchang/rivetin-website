import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,access } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256,packagePath } from './catalog-contract.mjs';
import { publicCatalogState,copyPublicCatalog } from './catalog-files.mjs';
import { importV4,recoverV4 } from './import-catalog-v4.mjs';
import { encode,emptyReleaseLedger,RELEASE_PATH,RELEASE_LEDGER,snapshotMetadata,metadataFor,MAX_RELEASE_LEDGER_BYTES } from './catalog-release-contract.mjs';
import { readbackRelease,verifyReleaseProof,frozenPublicationOutput } from './catalog-release-readback.mjs';
import { confirmRelease } from './catalog-release-confirm.mjs';
import {stageV4} from './catalog-v4-staging.mjs';
import {prepareReleaseRequest} from './prepare-catalog-release.mjs';
import {spawn} from 'node:child_process';
import {unlink} from 'node:fs/promises';

const root=fileURLToPath(new URL('../',import.meta.url)),at='2026-10-28T16:00:00.000Z';
const initial=encode({schemaVersion:4,plugins:[]});
async function save(base,name,raw){const p=path.join(base,name);await mkdir(path.dirname(p),{recursive:true});await writeFile(p,raw);}
function packageFixture({id='rivetin-fixture',version='0.1.0',strict=false}={}){
 const compatibility={frameworkApi:1,tower:'Fixture only',towerBuilds:['4.9.0'],...(strict?{schemaVersion:2,frameworkMinVersion:'0.2.0',frameworkMaxVersionExclusive:'0.3.0'}:{})},manifest={manifestVersion:1,id,version,name:{'zh-CN':'测试','en-US':'Fixture'},description:{'zh-CN':'测试','en-US':'Inert fixture'},author:'Rivetin contributors',license:'MIT',permissions:[],compatibility,frontend:{entry:'web/plugin.js',format:'rivetin-global-v1'}};
 const raw=encode({format:'rivetin-package-v1',manifest,files:[['web/plugin.js','/* inert */'],['LICENSE','MIT License']].map(([path,value])=>({path,data:Buffer.from(value).toString('base64'),sha256:sha256(Buffer.from(value))}))});const {frontend,manifestVersion,...entry}=manifest;return {raw,entry:{...entry,frameworkApi:1,status:'published',downloadPath:packagePath(id,version),sha256:sha256(raw)}};
}
async function fixture(){
 const parent=path.join(root,'.local','ml-release-id-20261029','fixtures');await mkdir(parent,{recursive:true});const dir=await mkdtemp(path.join(parent,'run-')),site=path.join(dir,'site'),old=packageFixture();
 await mkdir(path.join(site,'scripts'),{recursive:true});const legacy=encode({schemaVersion:3,plugins:[old.entry]});
 await save(site,'public/catalog/plugins.json',legacy);await save(site,'public/catalog/v4/plugins.json',initial);await save(site,'public'+old.entry.downloadPath,old.raw);
 await save(site,'catalog-integrity.json',encode({schemaVersion:1,packages:[{path:old.entry.downloadPath,sha256:old.entry.sha256,bytes:old.raw.length}]}));await save(site,RELEASE_LEDGER,encode(emptyReleaseLedger()));
 return {dir,site,legacy,old};
}
async function drop(f,{raw=initial,requestId=randomUUID(),baseHash=sha256(initial),baseReleaseSHA256=null,withRequest=true,items=[]}={}){
 const dir=path.join(f.dir,randomUUID()),stage=encode({schemaVersion:1,preparedAt:at,catalogPath:'catalog/v4/plugins.json',baseCatalogSHA256:baseHash,indexPath:'/catalog/v4/plugins.json',indexSHA256:sha256(raw),packages:items.map(p=>({id:p.entry.id,version:p.entry.version,downloadPath:p.entry.downloadPath,sha256:p.entry.sha256,bytes:p.raw.length})),candidateOnly:true});
 const request=encode({schemaVersion:1,requestId,stageSHA256:sha256(stage),catalogPath:'/catalog/v4/plugins.json',indexSHA256:sha256(raw),indexBytes:raw.length,baseReleaseSHA256,candidateOnly:true});
 await save(dir,'stage.json',stage);await save(dir,'catalog/v4/plugins.json',raw);if(withRequest)await save(dir,'release-stage.json',request);
 for(const p of items)await save(dir,p.entry.downloadPath,p.raw);
 return {siteRoot:f.site,dropRoot:dir,stageHash:sha256(stage),baseHash,releaseRequestHash:withRequest?sha256(request):null,publishedAt:at};
}
const headHash=state=>state.releaseRaw?sha256(state.releaseRaw):null;

test('publisher creates exact current/immutable sidecar and index with separate local state; v3/package bytes stay unchanged',async()=>{
 const f=await fixture(),d=await drop(f),result=await importV4(d),s=await publicCatalogState(f.site);assert.equal(result.publicationId,'ML-V4-261029.0');assert.equal(result.publicationState,'local-committed');assert.deepEqual(s.indexRaw,f.legacy);assert.deepEqual(await readFile(path.join(f.site,'public'+f.old.entry.downloadPath)),f.old.raw);assert.equal(s.releaseMetadata.publicationId,result.publicationId);assert.equal(s.publications.releases[0].verifiedAt,null);
 assert.deepEqual(await readFile(path.join(f.site,'public',s.releaseMetadata.snapshotPath)),initial);assert.deepEqual(await readFile(path.join(f.site,'public',snapshotMetadata(result.publicationId))),s.releaseRaw);
 const output=JSON.parse(await readFile(result.outputManifest,'utf8'));assert.equal(output.files.length,4);assert.equal(output.publicationState,'local-committed');assert.equal(sha256(await readFile(result.outputManifest)),result.outputManifestSHA256);assert.equal(output.requestId,JSON.parse(await readFile(path.join(d.dropRoot,'release-stage.json'),'utf8')).requestId);
 const dist=path.join(f.dir,'build');await mkdir(dist);await copyPublicCatalog(f.site,dist);for(const file of output.files)assert.equal(sha256(await readFile(path.join(dist,file.path))),file.sha256);
});
test('stage/check never persists a reservation; same request and unchanged index never allocate a second ID',async()=>{
 const f=await fixture(),d=await drop(f),before=await readFile(path.join(f.site,RELEASE_LEDGER));assert.equal((await importV4({...d,check:true})).result,'checked');assert.deepEqual(await readFile(path.join(f.site,RELEASE_LEDGER)),before);
 const first=await importV4(d),ledger=await readFile(path.join(f.site,RELEASE_LEDGER));assert.equal((await importV4({...d,publishedAt:'2026-10-30T00:00:00.000Z'})).result,'already-local-committed');assert.deepEqual(await readFile(path.join(f.site,RELEASE_LEDGER)),ledger);
 const state=await publicCatalogState(f.site),next=await drop(f,{baseReleaseSHA256:headHash(state)});const reused=await importV4({...next,publishedAt:'2026-10-30T00:00:00.000Z'});assert.equal(reused.result,'unchanged');assert.equal(reused.publicationId,first.publicationId);assert.deepEqual(await readFile(path.join(f.site,RELEASE_LEDGER)),ledger);
});
test('same request with changed input fails; subsequent raw changes increment decimal ID and retain old snapshots',async()=>{
 const f=await fixture(),d=await drop(f),first=await importV4(d),s=await publicCatalogState(f.site),raw=Buffer.concat([initial,Buffer.from(' ')]),id=JSON.parse(await readFile(path.join(d.dropRoot,'release-stage.json'),'utf8')).requestId;
 const changed=await drop(f,{raw,requestId:id,baseReleaseSHA256:headHash(s)});await assert.rejects(importV4(changed),/REQUEST_REUSED/);
 const second=await importV4(await drop(f,{raw,baseReleaseSHA256:headHash(s)}));assert.equal(second.publicationId,'ML-V4-261029.1');assert.deepEqual(await readFile(path.join(f.site,'public',`/catalog/v4/releases/${first.publicationId}/plugins.json`)),initial);
 const next=await publicCatalogState(f.site),rawNext=Buffer.concat([raw,Buffer.from(' ')]),third=await importV4({...await drop(f,{raw:rawNext,baseHash:sha256(raw),baseReleaseSHA256:headHash(next)}),publishedAt:'2026-10-29T16:00:00.000Z'});assert.equal(third.publicationId,'ML-V4-261030.0');
});
test('changed sidecar baseline or v4 update without a release request fails closed',async()=>{
 const f=await fixture();await importV4(await drop(f));await assert.rejects(importV4(await drop(f)),/RELEASE_BASE_CHANGED/);await assert.rejects(importV4(await drop(f,{raw:Buffer.concat([initial,Buffer.from(' ')]),withRequest:false})),/RELEASE_REQUEST_REQUIRED/);
});
test('every publication write cut rolls back only uncommitted new files and burns the reserved ID',async()=>{
 for(const phase of ['prepared','release-reserved','ledger-written','release-snapshot-index-written','release-snapshot-metadata-written','index-written','release-current-written','release-ledger-committed']){
  const f=await fixture(),d=await drop(f);await assert.rejects(importV4({...d,onPhase:async step=>{if(step===phase)throw Error('injected publication failure');}}),/injected publication failure/);
  const state=await publicCatalogState(f.site);assert.deepEqual(state.v4Raw,initial);assert.deepEqual(state.indexRaw,f.legacy);assert.equal(state.releaseRaw,null);assert.equal(state.publications.currentPublicationId,null);assert.equal(state.publications.releases[0].status,'abandoned');await assert.rejects(access(path.join(f.site,'.local/catalog-import.lock')));
  assert.equal((await importV4(await drop(f))).publicationId,'ML-V4-261029.1');
 }
});
test('unknown process outcome retains lock, recovery reuses reservation identity and recorded commit is reconciled',async()=>{
 for(const phase of ['release-reserved','release-snapshot-metadata-written','release-current-written','committed']){
  const f=await fixture(),d=await drop(f);await assert.rejects(importV4({...d,onPhase:async step=>{if(step===phase)throw Object.assign(Error('crash'),{code:'CATALOG_SIMULATED_CRASH'});}}),/crash/);
  const lock=JSON.parse(await readFile(path.join(f.site,'.local/catalog-import.lock'),'utf8'));await assert.rejects(importV4(d),/IMPORT_LOCKED/);const recovered=await recoverV4({siteRoot:f.site,transactionId:lock.id});assert.equal(recovered.result,phase==='committed'?'confirmed-committed':'rolled-back');const state=await publicCatalogState(f.site);assert.equal(state.publications.releases.length,1);assert.equal(state.publications.releases[0].status,phase==='committed'?'local-committed':'abandoned');
 }
});
test('recovery resumes after each release restore cut and never reuses the abandoned ID',async()=>{
 for(const cut of ['release-current-restored','release-uncommitted-snapshots-removed','release-reservation-abandoned']){
  const f=await fixture(),d=await drop(f);await assert.rejects(importV4({...d,onPhase:async step=>{if(step==='release-current-written')throw Object.assign(Error('crash'),{code:'CATALOG_SIMULATED_CRASH'});}}));const lock=JSON.parse(await readFile(path.join(f.site,'.local/catalog-import.lock'),'utf8'));
  await assert.rejects(recoverV4({siteRoot:f.site,transactionId:lock.id,onPhase:async step=>{if(step===cut)throw Error('recover interrupted');}}),/recover interrupted/);assert.equal((await recoverV4({siteRoot:f.site,transactionId:lock.id})).result,'rolled-back');assert.equal((await publicCatalogState(f.site)).publications.releases[0].status,'abandoned');
 }
});
test('conflicting sidecar/ledger/snapshot bytes retain lock and preserve the conflicting file',async()=>{
 for(const target of ['public/catalog/v4/release.json',RELEASE_LEDGER,'public/catalog/v4/releases/ML-V4-261029.0/plugins.json']){
  const f=await fixture(),d=await drop(f);await assert.rejects(importV4({...d,onPhase:async step=>{if(step==='release-current-written')throw Object.assign(Error('crash'),{code:'CATALOG_SIMULATED_CRASH'});}}));await save(f.site,target,Buffer.from('EXAMPLE_CONFLICT_BYTES'));const lock=JSON.parse(await readFile(path.join(f.site,'.local/catalog-import.lock'),'utf8'));
  await assert.rejects(recoverV4({siteRoot:f.site,transactionId:lock.id}),/ROLLBACK_CONFLICT/);assert.equal((await readFile(path.join(f.site,target))).toString(),'EXAMPLE_CONFLICT_BYTES');assert.ok(await readFile(path.join(f.site,'.local/catalog-import.lock')));
 }
});
test('failed subsequent publication restores the prior sidecar and preserves committed immutable snapshots',async()=>{
 const f=await fixture(),first=await importV4(await drop(f)),before=await publicCatalogState(f.site),raw=Buffer.concat([initial,Buffer.from(' ')]),d=await drop(f,{raw,baseReleaseSHA256:headHash(before)});
 await assert.rejects(importV4({...d,onPhase:async step=>{if(step==='release-current-written')throw Error('new release failure');}}),/new release failure/);
 const after=await publicCatalogState(f.site);assert.deepEqual(after.releaseRaw,before.releaseRaw);assert.deepEqual(after.v4Raw,before.v4Raw);assert.equal(after.publications.currentPublicationId,first.publicationId);assert.equal(after.publications.releases.at(-1).status,'abandoned');assert.deepEqual(await readFile(path.join(f.site,'public',snapshotMetadata(first.publicationId))),before.releaseRaw);
 assert.equal((await importV4(await drop(f,{raw,baseReleaseSHA256:headHash(after)}))).publicationId,'ML-V4-261029.2');
});
test('competing release writers and builds share the existing locks and do not allocate a second reservation',async()=>{
 const f=await fixture(),d=await drop(f);let ready,unblock;const started=new Promise(r=>ready=r),gate=new Promise(r=>unblock=r);
 const first=importV4({...d,onPhase:async step=>{if(step==='release-reserved'){ready();await gate;}}});await started;
 await assert.rejects(importV4(await drop(f)),/OWNER_LOCKED/);await assert.rejects(publicCatalogState(f.site),/IMPORT_LOCKED/);const out=path.join(f.dir,'build');await mkdir(out);await assert.rejects(copyPublicCatalog(f.site,out),/IMPORT_LOCKED/);unblock();await first;assert.equal((await publicCatalogState(f.site)).publications.releases.length,1);
});
async function proofFixture(){
 const f=await fixture(),d=await drop(f),installed=await importV4(d),manifest=JSON.parse(await readFile(installed.outputManifest,'utf8')),bodies=new Map();
 for(const file of manifest.files)bodies.set('https://rivetin.dev'+file.path,await readFile(path.join(f.site,'public',file.path)));
 return {...f,d,installed,manifest,bodies,options:{...d,publicationOutputFile:installed.outputManifest,publicationOutputHash:installed.outputManifestSHA256,output:path.join(f.dir,'proof'),fetcher:async url=>new Response(bodies.get(url),{status:200,headers:{'content-type':'application/json'}})}};
}
test('release readback binds four exact raw objects to frozen publisher output and saves separate seven-field receipts',async()=>{
 const f=await proofFixture(),result=await readbackRelease(f.options);assert.equal(result.receipts.length,4);assert.equal(result.httpsVerified,true);assert.deepEqual(Object.keys(result.receipts[0]),['schemaVersion','site','path','status','sha256','bytes','verifiedAt']);
 const proof=await verifyReleaseProof({manifest:f.manifest,proofRoot:f.options.output,notBefore:at});assert.equal(proof.publicationId,f.installed.publicationId);assert.deepEqual(await readFile(path.join(f.options.output,'catalog.release.json')),await readFile(path.join(f.options.output,'catalog.snapshot.release.json')));
 assert.equal((await publicCatalogState(f.site)).publications.releases[0].status,'local-committed');
});
test('mixed responses and wrong expected manifest fail before writing partial proof or changing source ledger',async()=>{
 const f=await proofFixture();f.bodies.set('https://rivetin.dev'+RELEASE_PATH,Buffer.from('EXAMPLE_WRONG_BYTES'));await assert.rejects(readbackRelease(f.options),/HASH_MISMATCH/);await assert.rejects(access(f.options.output));
 await assert.rejects(frozenPublicationOutput({...f.options,publicationOutputHash:'0'.repeat(64)}),/OUTPUT_CHANGED/);
 const copy=structuredClone(f.manifest);copy.files[1].path='/catalog/v4/../other.json';const changed=path.join(f.dir,'changed-manifest.json');await writeFile(changed,encode(copy));await assert.rejects(frozenPublicationOutput({...f.options,publicationOutputFile:changed,publicationOutputHash:sha256(encode(copy))}),/OUTPUT_BINDING/);
 assert.equal((await publicCatalogState(f.site)).publications.releases[0].status,'local-committed');
});
test('forged or stale receipts never turn a local commit into online verification',async()=>{
 const f=await proofFixture();await readbackRelease(f.options);const name=path.join(f.options.output,'catalog.release.receipt.json'),original=JSON.parse(await readFile(name,'utf8'));
 for(const change of [{sha256:'a'.repeat(64)},{site:'https://example.invalid'},{path:'/catalog/v4/plugins.json'},{verifiedAt:'2000-01-01T00:00:00.000Z'},{verifiedAt:'2099-01-01T00:00:00.000Z'},{privateActor:'EXAMPLE_NOT_PUBLIC'}]){await writeFile(name,encode({...original,...change}));await assert.rejects(verifyReleaseProof({manifest:f.manifest,proofRoot:f.options.output,notBefore:at}));}
 assert.equal((await publicCatalogState(f.site)).publications.releases[0].status,'local-committed');
});
test('only exact HTTPS proof promotes local ledger state; repeated confirmation is idempotent without a new ID',async()=>{
 const f=await proofFixture();await readbackRelease(f.options);const opts={...f.options,siteRoot:f.site,proofRoot:f.options.output},before=(await publicCatalogState(f.site)).releaseRaw;
 assert.equal((await confirmRelease(opts)).result,'online-verified');const state=await publicCatalogState(f.site);assert.equal(state.publications.releases[0].status,'verified');assert.equal(state.publications.releases.length,1);assert.ok(state.publications.releases[0].verifiedAt);assert.deepEqual(state.releaseRaw,before);const ledger=state.releaseLedgerRaw;
 assert.equal((await confirmRelease(opts)).result,'already-online-verified');assert.deepEqual((await publicCatalogState(f.site)).releaseLedgerRaw,ledger);assert.equal((await importV4(f.d)).result,'already-local-committed');
});
test('bad confirmation proof writes no ledger/journal and keeps the local commit unverified',async()=>{
 const f=await proofFixture();await readbackRelease(f.options);const state=await publicCatalogState(f.site),receipt=path.join(f.options.output,'catalog.snapshot.release.receipt.json'),value=JSON.parse(await readFile(receipt,'utf8'));await writeFile(receipt,encode({...value,sha256:'a'.repeat(64)}));
 await assert.rejects(confirmRelease({...f.options,siteRoot:f.site,proofRoot:f.options.output}),/RECEIPT_MISMATCH/);assert.deepEqual((await publicCatalogState(f.site)).releaseLedgerRaw,state.releaseLedgerRaw);await assert.rejects(access(path.join(f.site,'.local/catalog-import.lock')));
});
test('confirmation write failure restores only ledger status, and unknown outcomes are recovered under the same locks',async()=>{
 for(const phase of ['confirmation-prepared','confirmation-ledger-written','confirmation-committed']){
  const f=await proofFixture();await readbackRelease(f.options);const opts={...f.options,siteRoot:f.site,proofRoot:f.options.output};
  await assert.rejects(confirmRelease({...opts,onPhase:async step=>{if(step===phase)throw Object.assign(Error('confirmation crash'),{code:'CATALOG_SIMULATED_CRASH'});}}),/confirmation crash/);
  await assert.rejects(confirmRelease(opts),/IMPORT_LOCKED/);const lock=JSON.parse(await readFile(path.join(f.site,'.local/catalog-import.lock'),'utf8')),result=await recoverV4({siteRoot:f.site,transactionId:lock.id});assert.equal(result.result,phase==='confirmation-committed'?'confirmed-online-verification':'verification-rolled-back');const state=await publicCatalogState(f.site);assert.equal(state.publications.releases[0].status,phase==='confirmation-committed'?'verified':'local-committed');assert.equal(state.publications.releases.length,1);assert.equal(state.releaseMetadata.publicationId,f.installed.publicationId);
 }
});
test('interrupted confirmation rollback resumes, while intervening ledger bytes retain the lock',async()=>{
 const f=await proofFixture();await readbackRelease(f.options);const opts={...f.options,siteRoot:f.site,proofRoot:f.options.output};await assert.rejects(confirmRelease({...opts,onPhase:async step=>{if(step==='confirmation-ledger-written')throw Object.assign(Error('crash'),{code:'CATALOG_SIMULATED_CRASH'});}}));const lock=JSON.parse(await readFile(path.join(f.site,'.local/catalog-import.lock'),'utf8'));
 await assert.rejects(recoverV4({siteRoot:f.site,transactionId:lock.id,onPhase:async step=>{if(step==='confirmation-ledger-restored')throw Error('interrupted rollback');}}),/interrupted rollback/);assert.equal((await recoverV4({siteRoot:f.site,transactionId:lock.id})).result,'verification-rolled-back');assert.equal((await publicCatalogState(f.site)).publications.releases[0].status,'local-committed');
 await assert.rejects(confirmRelease({...opts,onPhase:async step=>{if(step==='confirmation-ledger-written')throw Object.assign(Error('crash'),{code:'CATALOG_SIMULATED_CRASH'});}}));const nextLock=JSON.parse(await readFile(path.join(f.site,'.local/catalog-import.lock'),'utf8'));await writeFile(path.join(f.site,RELEASE_LEDGER),'EXAMPLE_INTERVENING_LEDGER');await assert.rejects(recoverV4({siteRoot:f.site,transactionId:nextLock.id}),/ROLLBACK_CONFLICT/);assert.equal((await readFile(path.join(f.site,RELEASE_LEDGER))).toString(),'EXAMPLE_INTERVENING_LEDGER');
});
test('candidate staging keeps old immutable snapshots, omits a stale current sidecar, and allocates no ID',async()=>{
 const f=await fixture();await importV4(await drop(f));const state=await publicCatalogState(f.site),before=state.releaseLedgerRaw,d=await drop(f,{raw:Buffer.concat([initial,Buffer.from(' ')]),baseReleaseSHA256:headHash(state)}),output=path.join(f.site,'.local','preview');
 const staged=await stageV4({...d,output});assert.equal(staged.publicationPending,true);assert.equal(staged.publicationId,null);await assert.rejects(access(path.join(output,RELEASE_PATH)));assert.deepEqual(await readFile(path.join(output,state.releaseMetadata.snapshotPath)),initial);assert.deepEqual((await publicCatalogState(f.site)).releaseLedgerRaw,before);
});
test('request preparation is immutable/idempotent and does not allocate a public ID',async()=>{
 const f=await fixture(),d=await drop(f,{withRequest:false}),id=randomUUID(),first=await prepareReleaseRequest({...d,baseReleaseSHA256:null,requestId:id});assert.equal(first.result,'prepared-request');assert.equal((await prepareReleaseRequest({...d,baseReleaseSHA256:null,requestId:id})).result,'existing-request');await assert.rejects(prepareReleaseRequest({...d,baseReleaseSHA256:'a'.repeat(64),requestId:id}),/REQUEST_REUSED/);assert.deepEqual((await publicCatalogState(f.site)).publications,emptyReleaseLedger());
});
test('real process termination retains owner marker and recoverable reservation/confirmation journals',async()=>{
 for(const mode of ['publication','confirmation']){
  const f=await proofFixture();let source,argv;
  if(mode==='publication'){
   const state=await publicCatalogState(f.site),d=await drop(f,{raw:Buffer.concat([initial,Buffer.from(' ')]),baseReleaseSHA256:headHash(state)});source="import{importV4}from'./scripts/import-catalog-v4.mjs';await importV4({...JSON.parse(process.argv[1]),onPhase:async p=>{if(p==='release-current-written')process.exit(97);}});";argv=d;
  }else{await readbackRelease(f.options);source="import{confirmRelease}from'./scripts/catalog-release-confirm.mjs';await confirmRelease({...JSON.parse(process.argv[1]),onPhase:async p=>{if(p==='confirmation-ledger-written')process.exit(97);}});";argv={...f.options,siteRoot:f.site,proofRoot:f.options.output};delete argv.fetcher;}
  const child=spawn(process.execPath,['--input-type=module','-e',source,JSON.stringify(argv)],{cwd:root,stdio:'ignore',windowsHide:true});const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert.equal(code,97);
  const lock=JSON.parse(await readFile(path.join(f.site,'.local/catalog-import.lock'),'utf8'));await assert.rejects(recoverV4({siteRoot:f.site,transactionId:lock.id}),/OWNER_LOCKED/);
  // Child close above proves this fixture's owner has exited; no live lock is removed.
  const owner=path.resolve(f.site,'.local/catalog-v4-owner.lock');assert.ok(owner.startsWith(path.resolve(f.dir)+path.sep));await unlink(owner);
  const result=await recoverV4({siteRoot:f.site,transactionId:lock.id});assert.equal(result.result,mode==='publication'?'rolled-back':'verification-rolled-back');const state=await publicCatalogState(f.site);assert.equal(state.publications.releases[0].status,'local-committed');if(mode==='publication')assert.equal(state.publications.releases.at(-1).status,'abandoned');
 }
});
test('publication with a new inert package binds the existing package receipt and retains all legacy bytes',async()=>{
 const f=await fixture(),item=packageFixture({id:'rivetin-current-fixture',version:'0.2.0',strict:true}),raw=encode({schemaVersion:4,plugins:[item.entry]}),d=await drop(f,{raw,items:[item]}),installed=await importV4(d),manifest=JSON.parse(await readFile(installed.outputManifest,'utf8')),bodies=new Map();
 assert.equal(manifest.packages.length,1);for(const file of [...manifest.files,...manifest.packages])bodies.set('https://rivetin.dev'+file.path,await readFile(path.join(f.site,'public',file.path)));
 const opts={...d,publicationOutputFile:installed.outputManifest,publicationOutputHash:installed.outputManifestSHA256,output:path.join(f.dir,'proof-with-package'),fetcher:async url=>new Response(bodies.get(url),{status:200,headers:{'content-type':'application/json'}})};
 const proof=await readbackRelease(opts);assert.equal(proof.receipts.length,5);await confirmRelease({...opts,siteRoot:f.site,proofRoot:opts.output});const state=await publicCatalogState(f.site);assert.equal(state.packages.length,2);assert.deepEqual(state.indexRaw,f.legacy);assert.deepEqual(await readFile(path.join(f.site,'public',f.old.entry.downloadPath)),f.old.raw);assert.deepEqual(await readFile(path.join(f.site,'public',item.entry.downloadPath)),item.raw);
});

function abandonedLedger(count){
 const ledger=emptyReleaseLedger();
 for(let i=0;i<count;i++){
  const publicationId=`ML-V4-261029.${i}`,record={publicationId,catalogSchemaVersion:4,catalogSHA256:'a'.repeat(64),catalogBytes:initial.length,snapshotPath:`/catalog/v4/releases/${publicationId}/plugins.json`,publishedAt:at,metadataSHA256:null,metadataBytes:0,status:'abandoned',verifiedAt:null},metadata=encode(metadataFor(record));
  record.metadataSHA256=sha256(metadata);record.metadataBytes=metadata.length;ledger.releases.push(record);
 }
 return ledger;
}

test('a real ledger larger than 512 KiB supports publication, rollback, recovery and confirmation',async()=>{
 const f=await fixture(),large=encode(abandonedLedger(1100));assert.ok(large.length>512*1024&&large.length<MAX_RELEASE_LEDGER_BYTES);
 await save(f.site,RELEASE_LEDGER,large);const d=await drop(f),installed=await importV4(d);let state=await publicCatalogState(f.site);assert.equal(state.publications.releases.length,1101);
 const changed=await drop(f,{raw:Buffer.concat([initial,Buffer.from(' ')]),baseReleaseSHA256:headHash(state)});
 await assert.rejects(importV4({...changed,onPhase:async p=>{if(p==='release-current-written')throw Object.assign(Error('cut'),{code:'CATALOG_SIMULATED_CRASH'});}}));
 const lock=JSON.parse(await readFile(path.join(f.site,'.local/catalog-import.lock'),'utf8'));assert.equal((await recoverV4({siteRoot:f.site,transactionId:lock.id})).result,'rolled-back');state=await publicCatalogState(f.site);assert.equal(state.publications.releases.at(-1).status,'abandoned');assert.equal(state.publications.currentPublicationId,installed.publicationId);
 const manifest=JSON.parse(await readFile(installed.outputManifest,'utf8')),bodies=new Map();for(const file of manifest.files)bodies.set('https://rivetin.dev'+file.path,await readFile(path.join(f.site,'public',file.path)));
 const opts={...d,publicationOutputFile:installed.outputManifest,publicationOutputHash:installed.outputManifestSHA256,output:path.join(f.dir,'large-ledger-proof'),fetcher:async url=>new Response(bodies.get(url),{status:200,headers:{'content-type':'application/json'}})};await readbackRelease(opts);
 const confirmation={...opts,siteRoot:f.site,proofRoot:opts.output};await assert.rejects(confirmRelease({...confirmation,onPhase:async p=>{if(p==='confirmation-ledger-written')throw Object.assign(Error('cut'),{code:'CATALOG_SIMULATED_CRASH'});}}));
 const confirmationLock=JSON.parse(await readFile(path.join(f.site,'.local/catalog-import.lock'),'utf8'));assert.equal((await recoverV4({siteRoot:f.site,transactionId:confirmationLock.id})).result,'verification-rolled-back');assert.equal((await publicCatalogState(f.site)).publications.releases.find(r=>r.publicationId===installed.publicationId).status,'local-committed');
 await confirmRelease(confirmation);state=await publicCatalogState(f.site);assert.equal(state.publications.releases.find(r=>r.publicationId===installed.publicationId).status,'verified');assert.ok(state.releaseLedgerRaw.length>512*1024);await assert.rejects(access(path.join(f.site,'.local/catalog-import.lock')));
});

test('ledger capacity is checked before reservation, preserving bytes and releasing locks at the 2 MiB boundary',async()=>{
 const f=await fixture(),all=abandonedLedger(5000);let low=0,high=5000;
 while(low<high){const mid=Math.ceil((low+high)/2),raw=encode({...all,releases:all.releases.slice(0,mid)});if(raw.length<=MAX_RELEASE_LEDGER_BYTES)low=mid;else high=mid-1;}
 const raw=encode({...all,releases:all.releases.slice(0,low)});assert.ok(raw.length>MAX_RELEASE_LEDGER_BYTES-1024);await save(f.site,RELEASE_LEDGER,raw);
 await assert.rejects(importV4(await drop(f)),/LEDGER_SIZE_LIMIT/);assert.deepEqual(await readFile(path.join(f.site,RELEASE_LEDGER)),raw);await assert.rejects(access(path.join(f.site,'.local/catalog-import.lock')));await assert.rejects(access(path.join(f.site,'.local/catalog-v4-owner.lock')));
});
