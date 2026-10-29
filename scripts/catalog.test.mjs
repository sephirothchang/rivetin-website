import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importCatalog, publicCatalogState, copyPublicCatalog } from './catalog-files.mjs';
import { sha256, packagePath, validateCatalog, validateTransition, MAX_INDEX_BYTES, compatibility as validateLegacyCompatibility } from './catalog-contract.mjs';
import { download } from './readback-catalog.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
function fixture(version='0.1.0',code='/* inert fixture */'){
  const manifest={manifestVersion:1,id:'rivetin-fixture',version,name:{'zh-CN':'测试','en-US':'Fixture'},description:{'zh-CN':'测试','en-US':'Inert package fixture.'},author:'Rivetin contributors',license:'MIT',permissions:[],compatibility:{frameworkApi:1,tower:'Test fixture only',towerBuilds:['4.9.0']},frontend:{entry:'web/plugin.js',format:'rivetin-global-v1'}};
  const raw=encode({format:'rivetin-package-v1',manifest,files:[['web/plugin.js',code],['LICENSE','MIT License']].map(([file,text])=>({path:file,data:Buffer.from(text).toString('base64'),sha256:sha256(Buffer.from(text))}))});
  const {frontend,manifestVersion,...metadata}=manifest;
  const entry={...metadata,frameworkApi:1,status:'published',downloadPath:packagePath(manifest.id,version),sha256:sha256(raw)};
  const index=encode({schemaVersion:3,plugins:[entry]});
  const stage=encode({schemaVersion:1,preparedAt:new Date().toISOString(),catalogPath:'catalog/plugins.json',baseCatalogSHA256:'0'.repeat(64),indexPath:'/catalog/plugins.json',indexSHA256:sha256(index),packages:[{id:manifest.id,version,downloadPath:entry.downloadPath,sha256:entry.sha256,bytes:raw.length}],candidateOnly:true});
  return {raw,index,stage,entry};
}
async function workspace(t){
  await mkdir(path.join(root,'.local','catalog-tests'),{recursive:true});
  const dir=await mkdtemp(path.join(root,'.local','catalog-tests','run-'));
  t.after(async()=>{const target=path.resolve(dir),base=path.resolve(root,'.local','catalog-tests')+path.sep;assert.ok(target.startsWith(base));await rm(target,{recursive:true,force:true});});
  const site=path.join(dir,'site');await mkdir(path.join(site,'scripts'),{recursive:true});return {dir,site};
}
async function drop(dir,name,data){const location=path.join(dir,name);await mkdir(path.dirname(path.join(location,data.entry.downloadPath.slice(1))),{recursive:true});await mkdir(path.join(location,'catalog'),{recursive:true});await writeFile(path.join(location,data.entry.downloadPath.slice(1)),data.raw);await writeFile(path.join(location,'catalog/plugins.json'),data.index);await writeFile(path.join(location,'stage.json'),data.stage);return location;}
const run=(site,location,data)=>importCatalog({siteRoot:site,dropRoot:location,stageHash:sha256(data.stage)});

test('byte-exact import, idempotence, upgrade retains old packages and strict output allowlist',async t=>{
  const {dir,site}=await workspace(t),first=fixture(),a=await drop(dir,'drop-a',first);
  assert.equal((await run(site,a,first)).added,1);assert.equal((await run(site,a,first)).added,0);
  assert.deepEqual(await readFile(path.join(site,'public/catalog/plugins.json')),first.index);
  const next=fixture('0.1.1'),b=await drop(dir,'drop-b',next);await run(site,b,next);
  assert.equal((await publicCatalogState(site)).packages.length,2);
  assert.deepEqual(await readFile(path.join(site,'public',first.entry.downloadPath)),first.raw);
  const dist=path.join(dir,'dist');await mkdir(dist);await copyPublicCatalog(site,dist);
  assert.deepEqual(await readFile(path.join(dist,next.entry.downloadPath)),next.raw);
  await assert.rejects(readFile(path.join(dist,'stage.json')),/ENOENT/u);
  await assert.rejects(readFile(path.join(dist,'catalog-integrity.json')),/ENOENT/u);
  await writeFile(path.join(site,'public','unreviewed.txt'),'unreviewed');await assert.rejects(publicCatalogState(site),/CATALOG_PUBLIC_FILE_UNREGISTERED/u);
});
test('same-version replacement, rollback/downgrade and published removal are rejected',async t=>{
  const {dir,site}=await workspace(t),first=fixture(),a=await drop(dir,'drop-a',first);await run(site,a,first);
  const replacement=fixture('0.1.0','/* changed */'),b=await drop(dir,'drop-b',replacement);await assert.rejects(run(site,b,replacement),/IMMUTABLE/u);
  assert.deepEqual(await readFile(path.join(site,'public/catalog/plugins.json')),first.index);
  const previous={schemaVersion:3,plugins:[first.entry]};
  assert.throws(()=>validateTransition(previous,{schemaVersion:3,plugins:[]}),/REMOVAL/u);
  assert.throws(()=>validateTransition(previous,{schemaVersion:3,plugins:[{...first.entry,version:'0.0.9'}]}),/DOWNGRADE/u);
});
test('bad frozen hashes, missing or extra input fail without touching the current index',async t=>{
  const {dir,site}=await workspace(t),first=fixture(),a=await drop(dir,'drop-a',first);await run(site,a,first);
  await assert.rejects(importCatalog({siteRoot:site,dropRoot:a,stageHash:'f'.repeat(64)}),/STAGE_HASH/u);
  const b=await drop(dir,'drop-b',first);await writeFile(path.join(b,first.entry.downloadPath),'changed');await assert.rejects(run(site,b,first),/PACKAGE_HASH/u);
  const c=await drop(dir,'drop-c',first);await writeFile(path.join(c,'private.txt'),'private');await assert.rejects(run(site,c,first),/UNREGISTERED/u);
  const d=await drop(dir,'drop-d',first);await writeFile(path.join(d,'catalog/plugins.json'),'{}');await assert.rejects(run(site,d,first),/INDEX_HASH/u);
  assert.deepEqual(await readFile(path.join(site,'public/catalog/plugins.json')),first.index);
});
test('catalog paths, duplicates, draft downloads and empty published builds fail closed',()=>{
  const {entry}=fixture();
  for(const value of ['https://example.invalid/file','/downloads/../secret','/downloads/plugins/%2e%2e/file'])assert.throws(()=>validateCatalog({schemaVersion:3,plugins:[{...entry,downloadPath:value}]}));
  assert.throws(()=>validateCatalog({schemaVersion:3,plugins:[entry,entry]}),/DUPLICATE/u);
  assert.throws(()=>validateCatalog({schemaVersion:3,plugins:[{...entry,status:'draft'}]}),/PUBLICATION/u);
  assert.throws(()=>validateCatalog({schemaVersion:3,plugins:[{...entry,compatibility:{...entry.compatibility,towerBuilds:[]}}]}),/PUBLICATION/u);
});
test('history tampering and redirected source directories are rejected',async t=>{
  const {dir,site}=await workspace(t),first=fixture(),a=await drop(dir,'drop-a',first);await run(site,a,first);
  await writeFile(path.join(site,'public',first.entry.downloadPath),'changed');await assert.rejects(publicCatalogState(site),/IMMUTABLE/u);
  const alias=path.join(dir,'drop-link');await symlink(a,alias,process.platform==='win32'?'junction':'dir');
  await assert.rejects(run(site,alias,first),/PATH_INVALID/u);
});
test('HTTPS readback verifies real response bytes, exact receipt fields, redirects/types/size/hash',async()=>{
  const raw=Buffer.from('{"verified":true}\n'),expected={sha256:sha256(raw),bytes:raw.length};
  const response=(body=raw,status=200,type='application/json')=>async()=>new Response(body,{status,headers:{'content-type':type}});
  const result=await download('/catalog/plugins.json',expected,MAX_INDEX_BYTES,response());
  assert.deepEqual(result.raw,raw);assert.deepEqual(Object.keys(result.receipt),['schemaVersion','site','path','status','sha256','bytes','verifiedAt']);assert.match(result.receipt.verifiedAt,/Z$/u);
  await assert.rejects(download('/catalog/plugins.json',expected,MAX_INDEX_BYTES,response('redirect',302)),/STATUS/u);
  await assert.rejects(download('/catalog/plugins.json',expected,MAX_INDEX_BYTES,response('error',404)),/STATUS/u);
  await assert.rejects(download('/catalog/plugins.json',expected,MAX_INDEX_BYTES,response('<html>',200,'text/html')),/CONTENT_TYPE/u);
  await assert.rejects(download('/catalog/plugins.json',expected,MAX_INDEX_BYTES,response('{}')),/HASH/u);
  await assert.rejects(download('/catalog/plugins.json',expected,2,response()),/SIZE/u);
});

test('legacy v3 metadata treats upper as syntax only without imposing schema2 readerfloor on old declarations',()=>{
 const old={frameworkApi:1,tower:'Fixture only',towerBuilds:['4.9.0'],frameworkMinVersion:'0.2.0'};assert.equal(validateLegacyCompatibility(old),old);assert.doesNotThrow(()=>validateLegacyCompatibility({...old,frameworkMinVersion:'0.4.0',frameworkMaxVersionExclusive:'0.2.0'}));assert.throws(()=>validateLegacyCompatibility({...old,frameworkMaxVersionExclusive:'bad'}),/COMPATIBILITY/u);assert.throws(()=>validateLegacyCompatibility({...old,frameworkApi:2}),/COMPATIBILITY/u);
});
