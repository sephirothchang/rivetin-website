import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { sha256, packagePath, validateCatalog, validatePackage } from './catalog-contract.mjs';
import { importCatalog, publicCatalogState, copyPublicCatalog } from './catalog-files.mjs';
import { validateV4Catalog, validateV4Package, validateV4Compatibility, validateV4Transition, V4_INDEX_PATH } from './catalog-v4-contract.mjs';
import { frozenV4Drop, stageV4 } from './catalog-v4-staging.mjs';
import { readbackV4 } from './readback-catalog-v4.mjs';
import { importV4, recoverV4 } from './import-catalog-v4.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const legacyCompat={frameworkApi:1,tower:'Fixture build',towerBuilds:['4.9.0']};
const strictCompat={schemaVersion:2,frameworkApi:1,tower:'Fixture build',towerBuilds:['4.9.0'],frameworkMinVersion:'0.2.0',frameworkMaxVersionExclusive:'0.3.0'};
function fixture(id='rivetin-old',version='0.1.0',compatibility=legacyCompat,content='/* inert */'){
  const manifest={manifestVersion:1,id,version,name:{'zh-CN':'测试','en-US':'Fixture'},description:{'zh-CN':'测试','en-US':'Inert fixture'},author:'Rivetin contributors',license:'MIT',permissions:[],compatibility,frontend:{entry:'web/plugin.js',format:'rivetin-global-v1'}};
  const raw=encode({format:'rivetin-package-v1',manifest,files:[['web/plugin.js',content],['LICENSE','MIT License']].map(([path,body])=>({path,data:Buffer.from(body).toString('base64'),sha256:sha256(Buffer.from(body))}))});
  const {frontend,manifestVersion,...meta}=manifest;
  return {raw,entry:{...meta,frameworkApi:1,status:'published',downloadPath:packagePath(id,version),sha256:sha256(raw)}};
}
async function workspace(t){
  await mkdir(path.join(root,'.local','catalog-v4-tests'),{recursive:true});const dir=await mkdtemp(path.join(root,'.local','catalog-v4-tests','run-'));
  t.after(async()=>{const base=path.resolve(root,'.local','catalog-v4-tests')+path.sep;assert.ok(path.resolve(dir).startsWith(base));await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
  const site=path.join(dir,'site');await mkdir(path.join(site,'scripts'),{recursive:true});return {dir,site};
}
async function drop(dir,name,version,items,baseHash='f'.repeat(64)){
  const location=path.join(dir,name),catalogPath=version===4?'catalog/v4/plugins.json':'catalog/plugins.json';
  const index=encode({schemaVersion:version,plugins:items.map(x=>x.entry)});
  const stage=encode({schemaVersion:1,preparedAt:new Date().toISOString(),catalogPath,baseCatalogSHA256:baseHash,indexPath:'/'+catalogPath,indexSHA256:sha256(index),packages:items.filter(x=>x.entry.status==='published').map(({entry,raw})=>({id:entry.id,version:entry.version,downloadPath:entry.downloadPath,sha256:entry.sha256,bytes:raw.length})),candidateOnly:true});
  await mkdir(path.dirname(path.join(location,catalogPath)),{recursive:true});await writeFile(path.join(location,catalogPath),index);await writeFile(path.join(location,'stage.json'),stage);
  for(const {entry,raw} of items.filter(x=>x.entry.status==='published')){const target=path.join(location,entry.downloadPath);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,raw);}
  return {location,index,stage,baseHash};
}
async function setup(t){const {dir,site}=await workspace(t),old=fixture(),v3=await drop(dir,'v3',3,[old]);await importCatalog({siteRoot:site,dropRoot:v3.location,stageHash:sha256(v3.stage)});return {dir,site,old,v3};}
const stage=(site,input,name)=>stageV4({siteRoot:site,dropRoot:input.location,stageHash:sha256(input.stage),baseHash:input.baseHash,output:path.join(site,'.local',name)});

test('v4 requires strict compatibility even for draft; old and new schemas cannot be interchanged',()=>{
  const item=fixture('rivetin-new','0.2.0',strictCompat).entry;
  assert.deepEqual(validateV4Catalog({schemaVersion:4,plugins:[]}),{schemaVersion:4,plugins:[]});
  assert.doesNotThrow(()=>validateV4Catalog({schemaVersion:4,plugins:[item]}));
  assert.throws(()=>validateCatalog({schemaVersion:4,plugins:[item]}),/V3_REQUIRED/u);
  assert.throws(()=>validateV4Catalog({schemaVersion:3,plugins:[item]}),/V4_REQUIRED/u);
  const draft={...item,status:'draft',downloadPath:null,sha256:null};
  for(const change of [{compatibility:legacyCompat},{compatibility:{...strictCompat,schemaVersion:1}},{compatibility:{...strictCompat,unknown:true}},{compatibility:{...strictCompat,towerBuilds:[]}},{compatibility:{...strictCompat,frameworkMaxVersionExclusive:undefined}}])assert.throws(()=>validateV4Catalog({schemaVersion:4,plugins:[{...draft,...change}]}),/V4_COMPATIBILITY/u);
});
test('SMTX omitted and none are equivalent; exact scope and nonempty builds enforced',()=>{
  const f=fixture('rivetin-new','0.2.0',strictCompat);
  assert.doesNotThrow(()=>validateV4Package(f.raw,{...f.entry,compatibility:{...strictCompat,smtx:'none'}}));
  for(const smtx of [{product:'SMTX_ELF',scope:'all-managed-product-clusters',builds:['6.0.0']},{product:'SMTX_OS',scope:'some',builds:['6.0.0']},{product:'SMTX_OS',scope:'all-managed-product-clusters',builds:[]},{product:'SMTX_OS',scope:'all-managed-product-clusters',builds:['6.0.0'],extra:true}])assert.throws(()=>validateV4Catalog({schemaVersion:4,plugins:[{...f.entry,compatibility:{...strictCompat,smtx}}]}),/V4_COMPATIBILITY/u);
  assert.doesNotThrow(()=>validateV4Catalog({schemaVersion:4,plugins:[{...f.entry,compatibility:{...strictCompat,smtx:{product:'SMTX_OS',scope:'all-managed-product-clusters',builds:['6.0.0']}}}]}));
  assert.throws(()=>validatePackage(f.raw),/COMPATIBILITY/u);
});
test('v4 rejects unexpected fields, duplicate identities, oversized lists and mutated embedded files',()=>{
  const f=fixture('rivetin-new','0.2.0',strictCompat);
  assert.throws(()=>validateV4Catalog({schemaVersion:4,plugins:[],unexpected:true}),/V4_REQUIRED/u);
  assert.throws(()=>validateV4Catalog({schemaVersion:4,plugins:[{...f.entry,extra:'unexpected'}]}),/V4_ENTRY_INVALID/u);
  assert.throws(()=>validateV4Catalog({schemaVersion:4,plugins:[f.entry,f.entry]}),/DUPLICATE/u);
  assert.throws(()=>validateV4Catalog({schemaVersion:4,plugins:Array(501).fill(f.entry)}),/V4_REQUIRED/u);
  const raw=JSON.parse(f.raw);raw.files[0].data=Buffer.from('tampered').toString('base64');
  assert.throws(()=>validateV4Package(encode(raw)),/INTEGRITY/u);
  raw.files[0].path='web/../outside.js';assert.throws(()=>validateV4Package(encode(raw)),/FILE_INVALID/u);
});
test('empty v4 stages without changing legacy index or any historical package',async t=>{
  const {dir,site,old,v3}=await setup(t),v4=await drop(dir,'v4-empty',4,[]),out=await stage(site,v4,'empty-preview');
  assert.equal(out.published,0);assert.equal(out.retained,1);assert.equal(out.added,0);
  assert.deepEqual(await readFile(path.join(out.output,'catalog/plugins.json')),v3.index);
  assert.deepEqual(await readFile(path.join(out.output,'catalog/v4/plugins.json')),v4.index);
  assert.deepEqual(await readFile(path.join(out.output,old.entry.downloadPath)),old.raw);
  assert.deepEqual(await readFile(path.join(site,'public/catalog/plugins.json')),v3.index);
  await assert.rejects(readFile(path.join(site,'public/catalog/v4/plugins.json')),/ENOENT/u);
});
test('published candidate stages in isolation with verified v4 metadata and retained v3 bytes',async t=>{
  const {dir,site,v3}=await setup(t),candidate=fixture('rivetin-new','0.2.0',strictCompat),v4=await drop(dir,'v4-new',4,[candidate]),out=await stage(site,v4,'new-preview');
  assert.equal(out.published,1);assert.equal(out.added,1);assert.equal(out.legacyIndexSHA256,sha256(v3.index));
  assert.deepEqual(await readFile(path.join(out.output,candidate.entry.downloadPath)),candidate.raw);
  await assert.rejects(readFile(path.join(site,'public',candidate.entry.downloadPath)),/ENOENT/u);
});
test('cross-index same version conflicts, missing packages and extra input fail before staging output',async t=>{
  const {dir,site,old,v3}=await setup(t),changed=fixture(old.entry.id,old.entry.version,strictCompat,'/* changed */'),v4=await drop(dir,'v4-conflict',4,[changed]);
  await assert.rejects(stage(site,v4,'conflict-preview'),/SAME_VERSION_IMMUTABLE/u);
  const missing=await drop(dir,'v4-missing',4,[]);const entry=fixture('rivetin-new','0.2.0',strictCompat).entry;
  const index=encode({schemaVersion:4,plugins:[entry]}),stageDoc=JSON.parse(missing.stage);stageDoc.indexSHA256=sha256(index);missing.index=index;missing.stage=encode(stageDoc);
  await writeFile(path.join(missing.location,V4_INDEX_PATH.slice(1)),index);await writeFile(path.join(missing.location,'stage.json'),missing.stage);
  await assert.rejects(stage(site,missing,'missing-preview'),/PUBLISHED_FILE_MISSING/u);
  const extra=await drop(dir,'v4-extra',4,[]);await writeFile(path.join(extra.location,'private.txt'),'unexpected');await assert.rejects(stage(site,extra,'extra-preview'),/UNREGISTERED/u);
  assert.deepEqual(await readFile(path.join(site,'public/catalog/plugins.json')),v3.index);
});
test('stage and base digests, canonical paths and package integrity fail closed',async t=>{
  const {dir,site}=await setup(t),candidate=fixture('rivetin-new','0.2.0',strictCompat),v4=await drop(dir,'v4-hashes',4,[candidate]);
  await assert.rejects(frozenV4Drop(v4.location,'0'.repeat(64),v4.baseHash),/STAGE_HASH/u);
  await assert.rejects(frozenV4Drop(v4.location,sha256(v4.stage),'0'.repeat(64)),/STAGE_INVALID/u);
  const altered=structuredClone(candidate.entry);altered.downloadPath='/downloads/../wrong';assert.throws(()=>validateV4Catalog({schemaVersion:4,plugins:[altered]}));
  await writeFile(path.join(v4.location,candidate.entry.downloadPath),'changed');await assert.rejects(stage(site,v4,'hash-preview'),/PACKAGE_HASH/u);
});
test('v4 readback saves exact HTTPS bytes and seven-field receipts, and writes nothing on a wrong response',async t=>{
  const {dir}=await workspace(t),candidate=fixture('rivetin-new','0.2.0',strictCompat),v4=await drop(dir,'v4-proof',4,[candidate]);
  const output=path.join(dir,'proof');const bodies=new Map([['https://rivetin.dev'+V4_INDEX_PATH,v4.index],['https://rivetin.dev'+candidate.entry.downloadPath,candidate.raw]]);
  const fetcher=async url=>new Response(bodies.get(url),{status:200,headers:{'content-type':'application/json'}});
  const receipts=await readbackV4({dropRoot:v4.location,stageHash:sha256(v4.stage),baseHash:v4.baseHash,output,fetcher});
  assert.equal(receipts.length,2);assert.deepEqual(Object.keys(receipts[0]),['schemaVersion','site','path','status','sha256','bytes','verifiedAt']);
  assert.equal(receipts[0].path,V4_INDEX_PATH);assert.deepEqual(await readFile(path.join(output,'catalog.plugins.json')),v4.index);
  assert.deepEqual(JSON.parse(await readFile(path.join(output,'catalog.receipt.json'),'utf8')),receipts[0]);
  const badOutput=path.join(dir,'bad-proof');let call=0;
  await assert.rejects(readbackV4({dropRoot:v4.location,stageHash:sha256(v4.stage),baseHash:v4.baseHash,output:badOutput,fetcher:async url=>++call===1?fetcher(url):new Response('bad',{status:404})}),/HTTPS_STATUS/u);
  await assert.rejects(readFile(path.join(badOutput,'catalog.plugins.json')),/ENOENT/u);
});
const install=(site,input,options={})=>importV4({siteRoot:site,dropRoot:input.location,stageHash:sha256(input.stage),baseHash:input.baseHash,...options});
test('production dual-index import and subsequent upgrade retain all historical bytes',async t=>{
  const {dir,site,old,v3}=await setup(t),first=fixture('rivetin-new','0.2.0',strictCompat),v4=await drop(dir,'v4-published',4,[first]);
  const installed=await install(site,v4);assert.equal(installed.result,'committed');assert.equal(installed.added,1);
  let state=await publicCatalogState(site);assert.deepEqual(state.indexRaw,v3.index);assert.deepEqual(state.v4Raw,v4.index);assert.equal(state.packages.length,2);
  const second=fixture('rivetin-new','0.2.1',strictCompat,'/* next */'),v4next=await drop(dir,'v4-next',4,[second],sha256(v4.index));
  const upgraded=await install(site,v4next);assert.equal(upgraded.result,'committed');state=await publicCatalogState(site);assert.equal(state.packages.length,3);
  assert.deepEqual(await readFile(path.join(site,'public',first.entry.downloadPath)),first.raw);
  assert.deepEqual(await readFile(path.join(site,'public',old.entry.downloadPath)),old.raw);
  const dist=path.join(dir,'production');await mkdir(dist);await copyPublicCatalog(site,dist);
  assert.deepEqual(await readFile(path.join(dist,'catalog/plugins.json')),v3.index);
  assert.deepEqual(await readFile(path.join(dist,'catalog/v4/plugins.json')),v4next.index);
  assert.deepEqual(await readFile(path.join(dist,first.entry.downloadPath)),first.raw);
  assert.deepEqual(await readFile(path.join(dist,second.entry.downloadPath)),second.raw);
});
test('a subsequent v3 import preserves v4 index and global package history',async t=>{
  const {dir,site,v3}=await setup(t),item=fixture('rivetin-new','0.2.0',strictCompat),v4=await drop(dir,'coexist',4,[item]);
  await install(site,v4);await importCatalog({siteRoot:site,dropRoot:v3.location,stageHash:sha256(v3.stage)});
  const state=await publicCatalogState(site);assert.deepEqual(state.indexRaw,v3.index);assert.deepEqual(state.v4Raw,v4.index);assert.equal(state.packages.length,2);
  assert.deepEqual(await readFile(path.join(site,'public',item.entry.downloadPath)),item.raw);
});
test('delisting a v4 entry preserves its historical package and blocks changed same-version reuse',async t=>{
  const {dir,site}=await setup(t),item=fixture('rivetin-new','0.2.0',strictCompat),v4=await drop(dir,'before-delist',4,[item]);await install(site,v4);
  const delisted=await drop(dir,'delisted',4,[],sha256(v4.index));await install(site,delisted);
  const state=await publicCatalogState(site);assert.equal(state.v4Catalog.plugins.length,0);assert.equal(state.packages.length,2);
  assert.deepEqual(await readFile(path.join(site,'public',item.entry.downloadPath)),item.raw);
  const altered=fixture('rivetin-new','0.2.0',strictCompat,'/* altered */'),reuse=await drop(dir,'reuse-different',4,[altered],sha256(delisted.index));
  await assert.rejects(install(site,reuse),/SAME_VERSION_IMMUTABLE/u);
  const older=fixture('rivetin-new','0.1.9',strictCompat),downgrade=await drop(dir,'older-after-delist',4,[older],sha256(delisted.index));
  await assert.rejects(install(site,downgrade),/VERSION_DOWNGRADE/u);
  const dist=path.join(dir,'delisted-build');await mkdir(dist);await copyPublicCatalog(site,dist);assert.deepEqual(await readFile(path.join(dist,item.entry.downloadPath)),item.raw);
});
test('empty initial index, stale base and cross-version SHA collisions fail safely',async t=>{
  const {dir,site,old,v3}=await setup(t),empty=await drop(dir,'empty-first',4,[]);await install(site,empty);
  assert.deepEqual((await publicCatalogState(site)).indexRaw,v3.index);
  const collision=fixture(old.entry.id,old.entry.version,strictCompat,'/* changed */'),bad=await drop(dir,'collision-import',4,[collision],sha256(empty.index));
  await assert.rejects(install(site,bad),/SAME_VERSION_IMMUTABLE/u);
  const future=fixture('rivetin-new','0.2.0',strictCompat),stale=await drop(dir,'stale-base',4,[future]);
  await assert.rejects(install(site,stale),/BASE_CHANGED/u);
  assert.deepEqual((await publicCatalogState(site)).v4Raw,empty.index);
});
test('concurrent v3 and v4 imports share one lock and reject competing writers',async t=>{
  const {dir,site,v3}=await setup(t),v4=await drop(dir,'concurrent',4,[]);let unblock,ready;
  const gate=new Promise(resolve=>unblock=resolve),started=new Promise(resolve=>ready=resolve);
  const first=install(site,v4,{onPhase:async phase=>{if(phase==='prepared'){ready();await gate;}}});await started;
  await assert.rejects(install(site,v4),/OWNER_LOCKED/u);
  const activeLock=JSON.parse(await readFile(path.join(site,'.local/catalog-import.lock'),'utf8'));
  await assert.rejects(recoverV4({siteRoot:site,transactionId:activeLock.id}),/OWNER_LOCKED/u);
  await assert.rejects(importCatalog({siteRoot:site,dropRoot:v3.location,stageHash:sha256(v3.stage)}),/IMPORT_LOCKED/u);
  await assert.rejects(publicCatalogState(site),/IMPORT_LOCKED/u);
  const build=path.join(dir,'concurrent-build');await mkdir(build);await assert.rejects(copyPublicCatalog(site,build),/IMPORT_LOCKED/u);
  unblock();assert.equal((await first).result,'committed');
});
test('injected failures restore v3, ledger, v4 and remove only new files',async t=>{
  for(const phase of ['prepared','package-written','ledger-written','index-written']){
    const {dir,site,v3}=await setup(t),candidate=fixture('rivetin-new','0.2.0',strictCompat),v4=await drop(dir,'fault',4,[candidate]);
    const before=await readFile(path.join(site,'catalog-integrity.json'));
    await assert.rejects(install(site,v4,{onPhase:async current=>{if(current===phase)throw new Error('INJECTED_FAILURE');}}),/INJECTED_FAILURE/u);
    assert.deepEqual(await readFile(path.join(site,'public/catalog/plugins.json')),v3.index);
    assert.deepEqual(await readFile(path.join(site,'catalog-integrity.json')),before);
    await assert.rejects(readFile(path.join(site,'public/catalog/v4/plugins.json')),/ENOENT/u);
    await assert.rejects(readFile(path.join(site,'public',candidate.entry.downloadPath)),/ENOENT/u);
    await assert.rejects(readFile(path.join(site,'.local/catalog-import.lock')),/ENOENT/u);
    assert.ok(await publicCatalogState(site));
  }
});
test('interrupted imports retain a journal and lock and can be safely recovered',async t=>{
  const {dir,site,v3}=await setup(t),candidate=fixture('rivetin-new','0.2.0',strictCompat),v4=await drop(dir,'interrupted',4,[candidate]);
  await assert.rejects(install(site,v4,{onPhase:async phase=>{if(phase==='ledger-written')throw Object.assign(new Error('simulated crash'),{code:'CATALOG_SIMULATED_CRASH'});}}),/simulated crash/u);
  const lock=JSON.parse(await readFile(path.join(site,'.local/catalog-import.lock'),'utf8'));
  await assert.rejects(install(site,v4),/IMPORT_LOCKED/u);
  assert.equal((await recoverV4({siteRoot:site,transactionId:lock.id})).result,'rolled-back');
  assert.deepEqual((await publicCatalogState(site)).indexRaw,v3.index);
  await assert.rejects(readFile(path.join(site,'public',candidate.entry.downloadPath)),/ENOENT/u);
});
test('recovery can resume safely after interruption at each restore step',async t=>{
  for(const phase of ['index-restored','ledger-restored','packages-removed']){
    const {dir,site,v3}=await setup(t),item=fixture('rivetin-new','0.2.0',strictCompat),v4=await drop(dir,'recovery-interrupt',4,[item]);
    await assert.rejects(install(site,v4,{onPhase:async step=>{if(step==='index-written')throw Object.assign(new Error('crash'),{code:'CATALOG_SIMULATED_CRASH'});}}));
    const lock=JSON.parse(await readFile(path.join(site,'.local/catalog-import.lock'),'utf8'));
    await assert.rejects(recoverV4({siteRoot:site,transactionId:lock.id,onPhase:async step=>{if(step===phase)throw new Error('recovery interrupted');}}),/recovery interrupted/u);
    assert.equal((await recoverV4({siteRoot:site,transactionId:lock.id})).result,'rolled-back');
    assert.deepEqual((await publicCatalogState(site)).indexRaw,v3.index);
  }
});
test('recovery rejects tampered backups or intervening writes and retains the lock',async t=>{
  const {dir,site}=await setup(t),candidate=fixture('rivetin-new','0.2.0',strictCompat),v4=await drop(dir,'tamper',4,[candidate]);
  await assert.rejects(install(site,v4,{onPhase:async phase=>{if(phase==='package-written')throw Object.assign(new Error('crash'),{code:'CATALOG_SIMULATED_CRASH'});}}));
  const lock=JSON.parse(await readFile(path.join(site,'.local/catalog-import.lock'),'utf8'));
  await writeFile(path.join(site,'public',candidate.entry.downloadPath),'unexpected intervening change');
  await assert.rejects(recoverV4({siteRoot:site,transactionId:lock.id}),/ROLLBACK_CONFLICT/u);
  assert.equal(JSON.parse(await readFile(path.join(site,'.local/catalog-import.lock'),'utf8')).id,lock.id);
});
test('recovery refuses altered backup bytes without modifying the active state',async t=>{
  const {dir,site}=await setup(t),v4=await drop(dir,'backup-tamper',4,[]);
  await assert.rejects(install(site,v4,{onPhase:async phase=>{if(phase==='ledger-written')throw Object.assign(new Error('crash'),{code:'CATALOG_SIMULATED_CRASH'});}}));
  const lock=JSON.parse(await readFile(path.join(site,'.local/catalog-import.lock'),'utf8'));
  await writeFile(path.join(site,'.local/catalog-v4-transactions',lock.id,'backup/catalog/plugins.json'),'tampered');
  await assert.rejects(recoverV4({siteRoot:site,transactionId:lock.id}),/BACKUP_CHANGED/u);
  assert.equal(JSON.parse(await readFile(path.join(site,'.local/catalog-import.lock'),'utf8')).id,lock.id);
});
test('hard process termination leaves recoverable state; a recorded commit is reconciled without rollback',async t=>{
  for(const [phase,expected] of [['index-written','rolled-back'],['committed','confirmed-committed']]){
    const {dir,site,v3}=await setup(t),candidate=fixture('rivetin-new','0.2.0',strictCompat),v4=await drop(dir,'process-crash',4,[candidate]);
    const source=`import { importV4 } from './scripts/import-catalog-v4.mjs'; await importV4({siteRoot:process.argv[1],dropRoot:process.argv[2],stageHash:process.argv[3],baseHash:process.argv[4],onPhase:async phase=>{if(phase===process.argv[5])process.exit(97);}});`;
    const child=spawn(process.execPath,['--input-type=module','-e',source,site,v4.location,sha256(v4.stage),v4.baseHash,phase],{cwd:root,stdio:'ignore'});
    const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});assert.equal(result.code,97);
    const lock=JSON.parse(await readFile(path.join(site,'.local/catalog-import.lock'),'utf8'));
    await assert.rejects(recoverV4({siteRoot:site,transactionId:lock.id}),/OWNER_LOCKED/u);
    // The child has exited; this simulates an operator verifying that fact before clearing its stale owner marker.
    await unlink(path.join(site,'.local/catalog-v4-owner.lock'));
    assert.equal((await recoverV4({siteRoot:site,transactionId:lock.id})).result,expected);
    const state=await publicCatalogState(site);assert.deepEqual(state.indexRaw,v3.index);
    if(expected==='rolled-back')assert.equal(state.v4Raw,null);else assert.deepEqual(state.v4Raw,v4.index);
  }
});

test('recovery is mutually exclusive and a killed recovery retains its owner marker',async t=>{
  const {dir,site}=await setup(t),v4=await drop(dir,'recover-race',4,[]);
  await assert.rejects(install(site,v4,{onPhase:async phase=>{if(phase==='index-written')throw Object.assign(new Error('crash'),{code:'CATALOG_SIMULATED_CRASH'});}}));
  const lock=JSON.parse(await readFile(path.join(site,'.local/catalog-import.lock'),'utf8'));
  let ready,unblock;const started=new Promise(r=>ready=r),gate=new Promise(r=>unblock=r);
  const first=recoverV4({siteRoot:site,transactionId:lock.id,onPhase:async phase=>{if(phase==='index-restored'){ready();await gate;}}});await started;
  await assert.rejects(recoverV4({siteRoot:site,transactionId:lock.id}),/OWNER_LOCKED/u);
  await assert.rejects(install(site,v4),/OWNER_LOCKED/u);unblock();assert.equal((await first).result,'rolled-back');
  await assert.rejects(install(site,v4,{onPhase:async phase=>{if(phase==='index-written')throw Object.assign(new Error('crash'),{code:'CATALOG_SIMULATED_CRASH'});}}));
  const next=JSON.parse(await readFile(path.join(site,'.local/catalog-import.lock'),'utf8'));
  const source=`import { recoverV4 } from './scripts/import-catalog-v4.mjs'; await recoverV4({siteRoot:process.argv[1],transactionId:process.argv[2],onPhase:async phase=>{if(phase==='index-restored')process.exit(97);}});`;
  const child=spawn(process.execPath,['--input-type=module','-e',source,site,next.id],{cwd:root,stdio:'ignore'});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert.equal(code,97);
  await assert.rejects(recoverV4({siteRoot:site,transactionId:next.id}),/OWNER_LOCKED/u);
  await unlink(path.join(site,'.local/catalog-v4-owner.lock'));
  assert.equal((await recoverV4({siteRoot:site,transactionId:next.id})).result,'rolled-back');
});

test('termination before journal preparation remains unknown and cannot be automatically recovered',async t=>{
  const {dir,site,v3}=await setup(t),v4=await drop(dir,'early-crash',4,[]);
  const source=`import { importV4 } from './scripts/import-catalog-v4.mjs'; await importV4({siteRoot:process.argv[1],dropRoot:process.argv[2],stageHash:process.argv[3],baseHash:process.argv[4],onPhase:async phase=>{if(phase==='lock-initialized')process.exit(97);}});`;
  const child=spawn(process.execPath,['--input-type=module','-e',source,site,v4.location,sha256(v4.stage),v4.baseHash],{cwd:root,stdio:'ignore'});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert.equal(code,97);
  const lock=JSON.parse(await readFile(path.join(site,'.local/catalog-import.lock'),'utf8'));assert.equal(lock.manifestSHA256,null);
  await assert.rejects(recoverV4({siteRoot:site,transactionId:lock.id}),/OWNER_LOCKED/u);
  await unlink(path.join(site,'.local/catalog-v4-owner.lock'));
  await assert.rejects(recoverV4({siteRoot:site,transactionId:lock.id}));
  assert.deepEqual(await readFile(path.join(site,'public/catalog/plugins.json')),v3.index);
  assert.equal(JSON.parse(await readFile(path.join(site,'.local/catalog-import.lock'),'utf8')).id,lock.id);
});

test('v3 writer cannot acquire shared lock between internal rollback and owner release',async t=>{
  const {dir,site,v3}=await setup(t),v4=await drop(dir,'rollback-v3-race',4,[]);
  let ready,unblock;const started=new Promise(r=>ready=r),gate=new Promise(r=>unblock=r);
  const operation=install(site,v4,{onPhase:async phase=>{if(phase==='index-written')throw new Error('injected');if(phase==='rollback-complete'){ready();await gate;}}});
  await started;
  await assert.rejects(importCatalog({siteRoot:site,dropRoot:v3.location,stageHash:sha256(v3.stage)}),/IMPORT_LOCKED/u);
  unblock();await assert.rejects(operation,/injected/u);
  assert.ok(await importCatalog({siteRoot:site,dropRoot:v3.location,stageHash:sha256(v3.stage)}));
  assert.deepEqual((await publicCatalogState(site)).indexRaw,v3.index);
});

test('schema2 minimum-only metadata accepts optional max at024 floor, keeps old raw syntax and independent gates',()=>{
 const noMax={...strictCompat,frameworkMinVersion:'0.2.4'};delete noMax.frameworkMaxVersionExclusive;assert.equal(validateV4Compatibility(noMax),noMax);const sample=fixture('rivetin-new','0.2.4',noMax);assert.doesNotThrow(()=>validateV4Package(sample.raw,sample.entry));
 for(const minimum of ['0.2.0','0.2.3'])assert.throws(()=>validateV4Compatibility({...noMax,frameworkMinVersion:minimum}),/V4_COMPATIBILITY/u);
 const inverted={...strictCompat,frameworkMinVersion:'0.4.0',frameworkMaxVersionExclusive:'0.2.0'};assert.equal(validateV4Compatibility(inverted),inverted);assert.equal(inverted.frameworkMaxVersionExclusive,'0.2.0');
 for(const change of [{frameworkApi:2},{towerBuilds:[]},{smtx:{product:'SMTX_OS',scope:'wrong',builds:['4.9.0']}},{frameworkMaxVersionExclusive:null},{frameworkMaxVersionExclusive:undefined},{frameworkMaxVersionExclusive:'v0.3.0'}])assert.throws(()=>validateV4Compatibility({...noMax,...change}),/V4_COMPATIBILITY/u);
 const old=fixture('rivetin-new','0.2.0',strictCompat).entry,next=structuredClone(old);next.compatibility.frameworkMaxVersionExclusive='9.0.0';assert.throws(()=>validateV4Transition({plugins:[old]},{plugins:[next]}),/SAME_VERSION_IMMUTABLE/u,'semantic upper removal never permits rewriting same-version raw metadata');
});
