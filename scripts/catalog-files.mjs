import { constants } from 'node:fs';
import { lstat, readdir, open, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { INDEX_PATH, MAX_INDEX_BYTES, MAX_PACKAGE_BYTES, MAX_TOTAL_BYTES, exact, fail, sha256, validHash, packagePath, parsePackagePath, parseJson, validateCatalog, validatePackage, validateTransition } from './catalog-contract.mjs';
import { V4_INDEX_PATH, validateV4Catalog, validateV4Package } from './catalog-v4-contract.mjs';

const LEDGER='catalog-integrity.json';
export async function optionalStat(file){try{return await lstat(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function relative(name){if(typeof name!=='string'||!name||/[\\:\x00-\x1f\x7f]/u.test(name)||name.split('/').some(part=>!part||part==='.'||part==='..'))fail('CATALOG_PATH_INVALID');return name;}
export async function safePath(root,name,{missing=false,directory=false}={}){
  relative(name);const base=await lstat(root);if(!base.isDirectory()||base.isSymbolicLink())fail('CATALOG_PATH_INVALID');
  const parts=name.split('/');let current=root;
  for(let i=0;i<parts.length;i++){
    current=path.join(current,parts[i]);const info=await optionalStat(current),last=i===parts.length-1;
    if(!info){if(missing&&last)return current;fail('CATALOG_FILE_MISSING');}
    if(info.isSymbolicLink()||((!last||directory)?!info.isDirectory():!info.isFile())||(last&&!directory&&info.nlink!==1))fail('CATALOG_PATH_INVALID');
  }
  return current;
}
export async function boundedFile(root,name,max){
  const file=await safePath(root,name),handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try{const info=await handle.stat();if(!info.isFile()||info.size>max||info.size===0)fail('CATALOG_SIZE_LIMIT');const raw=await handle.readFile();if(raw.length!==info.size||raw.length>max)fail('CATALOG_INPUT_CHANGED');return raw;}finally{await handle.close();}
}
async function treeFiles(root){
  const info=await lstat(root);if(!info.isDirectory()||info.isSymbolicLink())fail('CATALOG_PATH_INVALID');
  const files=[];let total=0;
  async function visit(name=''){
    const dir=name?await safePath(root,name,{directory:true}):root;
    for(const entry of await readdir(dir,{withFileTypes:true})){
      const next=name?`${name}/${entry.name}`:entry.name;
      if(entry.isSymbolicLink())fail('CATALOG_PATH_INVALID');
      if(entry.isDirectory())await visit(next);
      else{const file=await safePath(root,next),info=await lstat(file);total+=info.size;if(files.length>=5001||total>MAX_TOTAL_BYTES)fail('CATALOG_SITE_SIZE_LIMIT');files.push(next);}
    }
  }
  await visit();return files;
}
export async function ensureParents(root,name){
  relative(name);let current=root;
  for(const part of name.split('/').slice(0,-1)){
    current=path.join(current,part);let info=await optionalStat(current);
    if(!info){await mkdir(current);info=await lstat(current);}
    if(!info.isDirectory()||info.isSymbolicLink())fail('CATALOG_PATH_INVALID');
  }
}
export async function optionalBytes(root,name,max){return await optionalStat(path.join(root,name))?boundedFile(root,name,max):null;}
export function ledger(value){
  if(!exact(value,['schemaVersion','packages'])||value.schemaVersion!==1||!Array.isArray(value.packages)||value.packages.length>5000)fail('CATALOG_LEDGER_INVALID');
  const seen=new Set();let total=0;
  for(const item of value.packages){
    if(!exact(item,['path','sha256','bytes'])||!validHash(item.sha256)||!Number.isSafeInteger(item.bytes)||item.bytes<=0||item.bytes>MAX_PACKAGE_BYTES)fail('CATALOG_LEDGER_INVALID');
    parsePackagePath(item.path);if(seen.has(item.path))fail('CATALOG_LEDGER_INVALID');seen.add(item.path);total+=item.bytes;
  }
  if(total>MAX_TOTAL_BYTES)fail('CATALOG_SITE_SIZE_LIMIT');return value;
}
export async function publicCatalogState(siteRoot,{allowLocked=false}={}){
  if(!allowLocked&&await optionalStat(path.join(siteRoot,'.local','catalog-import.lock')))fail('CATALOG_IMPORT_LOCKED');
  const publicRoot=path.join(siteRoot,'public'),info=await optionalStat(publicRoot);
  const ledgerRaw=await optionalBytes(siteRoot,LEDGER,MAX_INDEX_BYTES);
  if(!info){if(ledgerRaw)fail('CATALOG_LEDGER_ORPHAN');return {catalog:null,indexRaw:null,ledgerRaw:null,packages:[],publicRoot};}
  if(!info.isDirectory()||info.isSymbolicLink())fail('CATALOG_PATH_INVALID');
  const files=await treeFiles(publicRoot),indexRaw=files.includes(INDEX_PATH.slice(1))?await boundedFile(publicRoot,INDEX_PATH.slice(1),MAX_INDEX_BYTES):null;
  if(!indexRaw){if(files.length||ledgerRaw)fail('CATALOG_INDEX_MISSING');return {catalog:null,indexRaw:null,ledgerRaw:null,packages:[],publicRoot};}
  if(!ledgerRaw)fail('CATALOG_LEDGER_MISSING');
  const catalog=validateCatalog(parseJson(indexRaw,MAX_INDEX_BYTES)),packages=ledger(parseJson(ledgerRaw,MAX_INDEX_BYTES)).packages;
  const v4Raw=files.includes(V4_INDEX_PATH.slice(1))?await boundedFile(publicRoot,V4_INDEX_PATH.slice(1),MAX_INDEX_BYTES):null;
  const v4Catalog=v4Raw?validateV4Catalog(parseJson(v4Raw,MAX_INDEX_BYTES)):null;
  const expected=new Set([INDEX_PATH.slice(1),...(v4Raw?[V4_INDEX_PATH.slice(1)]:[]),...packages.map(item=>item.path.slice(1))]);
  if(files.length!==expected.size||files.some(file=>!expected.has(file)))fail('CATALOG_PUBLIC_FILE_UNREGISTERED');
  for(const record of packages){
    const raw=await boundedFile(publicRoot,record.path.slice(1),MAX_PACKAGE_BYTES),identity=parsePackagePath(record.path);
    if(raw.length!==record.bytes||sha256(raw)!==record.sha256)fail('CATALOG_IMMUTABLE_FILE_CHANGED');
    const current=catalog.plugins.find(item=>item.downloadPath===record.path),currentV4=v4Catalog?.plugins.find(item=>item.downloadPath===record.path);
    const manifest=parseJson(raw,MAX_PACKAGE_BYTES).manifest;
    const actual=manifest?.compatibility?.schemaVersion===2?validateV4Package(raw,currentV4):validatePackage(raw,current);
    if(current&&manifest?.compatibility?.schemaVersion===2||currentV4&&manifest?.compatibility?.schemaVersion!==2||actual.id!==identity.id||actual.version!==identity.version)fail('CATALOG_PACKAGE_IDENTITY_MISMATCH');
  }
  for(const item of catalog.plugins.filter(item=>item.status==='published'))if(!packages.some(record=>record.path===item.downloadPath&&record.sha256===item.sha256))fail('CATALOG_PUBLISHED_FILE_MISSING');
  for(const item of v4Catalog?.plugins.filter(item=>item.status==='published')??[])if(!packages.some(record=>record.path===item.downloadPath&&record.sha256===item.sha256))fail('CATALOG_PUBLISHED_FILE_MISSING');
  return {catalog,indexRaw,v4Catalog,v4Raw,ledgerRaw,packages,publicRoot};
}
export async function frozenDrop(dropRoot,expectedStageHash){
  if(!path.isAbsolute(dropRoot)||!validHash(expectedStageHash))fail('CATALOG_FROZEN_INPUT_REQUIRED');
  const stageRaw=await boundedFile(dropRoot,'stage.json',256*1024);
  if(sha256(stageRaw)!==expectedStageHash)fail('CATALOG_STAGE_HASH_MISMATCH');
  const stage=parseJson(stageRaw,256*1024);
  if(!exact(stage,['schemaVersion','preparedAt','catalogPath','baseCatalogSHA256','indexPath','indexSHA256','packages','candidateOnly'])||stage.schemaVersion!==1||stage.candidateOnly!==true||stage.catalogPath!=='catalog/plugins.json'||stage.indexPath!==INDEX_PATH||!validHash(stage.indexSHA256)||!validHash(stage.baseCatalogSHA256)||typeof stage.preparedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(stage.preparedAt)||!Number.isFinite(Date.parse(stage.preparedAt))||!Array.isArray(stage.packages)||!stage.packages.length||stage.packages.length>500)fail('CATALOG_STAGE_INVALID');
  const indexRaw=await boundedFile(dropRoot,INDEX_PATH.slice(1),MAX_INDEX_BYTES);
  if(sha256(indexRaw)!==stage.indexSHA256)fail('CATALOG_INDEX_HASH_MISMATCH');
  const catalog=validateCatalog(parseJson(indexRaw,MAX_INDEX_BYTES)),seen=new Set(),records=[];
  for(const item of stage.packages){
    if(!exact(item,['id','version','downloadPath','sha256','bytes'])||item.downloadPath!==packagePath(item.id,item.version)||!validHash(item.sha256)||!Number.isSafeInteger(item.bytes)||item.bytes<=0||item.bytes>MAX_PACKAGE_BYTES||seen.has(item.id))fail('CATALOG_STAGE_PACKAGE_INVALID');
    seen.add(item.id);const entry=catalog.plugins.find(p=>p.id===item.id&&p.version===item.version&&p.status==='published');
    if(!entry||entry.downloadPath!==item.downloadPath||entry.sha256!==item.sha256)fail('CATALOG_STAGE_INDEX_MISMATCH');
    const raw=await boundedFile(dropRoot,item.downloadPath.slice(1),MAX_PACKAGE_BYTES);
    if(raw.length!==item.bytes||sha256(raw)!==item.sha256)fail('CATALOG_PACKAGE_HASH_MISMATCH');
    validatePackage(raw,entry);records.push({path:item.downloadPath,sha256:item.sha256,bytes:item.bytes});
  }
  const files=await treeFiles(dropRoot),allowed=new Set(['stage.json',INDEX_PATH.slice(1),...records.map(item=>item.path.slice(1))]);
  if(files.length!==allowed.size||files.some(file=>!allowed.has(file)))fail('CATALOG_DROP_FILE_UNREGISTERED');
  return {stage,stageRaw,indexRaw,catalog,packages:records,dropRoot};
}
export async function exclusive(root,name,raw){
  await ensureParents(root,name);const target=await safePath(root,name,{missing:true}),handle=await open(target,'wx',0o644);
  try{await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
}
export async function replace(root,name,raw,expected){
  await ensureParents(root,name);const existing=await optionalBytes(root,name,MAX_INDEX_BYTES);
  if(!isDeepStrictEqual(existing,expected))fail('CATALOG_TARGET_CHANGED');
  const temporary=`${name}.${randomUUID()}.tmp`;
  try{await exclusive(root,temporary,raw);if(!isDeepStrictEqual(await optionalBytes(root,name,MAX_INDEX_BYTES),expected))fail('CATALOG_TARGET_CHANGED');await rename(path.join(root,temporary),path.join(root,name));}
  finally{await unlink(path.join(root,temporary)).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
export async function importCatalog({siteRoot,dropRoot,stageHash,check=false}){
  const drop=await frozenDrop(dropRoot,stageHash);
  await safePath(siteRoot,'scripts',{directory:true});
  const localInfo=await optionalStat(path.join(siteRoot,'.local'));if(localInfo?.isSymbolicLink())fail('CATALOG_PATH_INVALID');
  await mkdir(path.join(siteRoot,'.local'),{recursive:true});
  const lock=await open(path.join(siteRoot,'.local','catalog-import.lock'),'wx',0o600).catch(error=>{if(error.code==='EEXIST')fail('CATALOG_IMPORT_LOCKED');throw error;});
  const created=[];let ledgerWritten=false,state,newLedger;
  try{
    state=await publicCatalogState(siteRoot,{allowLocked:true});validateTransition(state.catalog,drop.catalog);
    const combined=new Map(state.packages.map(record=>[record.path,record]));
    for(const record of drop.packages){const previous=combined.get(record.path);if(previous&&!isDeepStrictEqual(previous,record))fail('CATALOG_SAME_VERSION_IMMUTABLE');combined.set(record.path,record);}
    const packages=ledger({schemaVersion:1,packages:[...combined.values()].sort((a,b)=>a.path.localeCompare(b.path,'en'))}).packages;
    for(const item of drop.catalog.plugins.filter(item=>item.status==='published'))if(!packages.some(record=>record.path===item.downloadPath&&record.sha256===item.sha256))fail('CATALOG_PUBLISHED_FILE_MISSING');
    const result={checked:check,indexSHA256:sha256(drop.indexRaw),published:drop.catalog.plugins.filter(item=>item.status==='published').length,added:drop.packages.filter(record=>!state.packages.some(old=>old.path===record.path)).length,retained:state.packages.length};
    if(check)return result;
    await mkdir(state.publicRoot,{recursive:true});
    for(const record of drop.packages){
      if(state.packages.some(old=>old.path===record.path))continue;
      const raw=await boundedFile(dropRoot,record.path.slice(1),MAX_PACKAGE_BYTES);if(raw.length!==record.bytes||sha256(raw)!==record.sha256)fail('CATALOG_INPUT_CHANGED');
      await exclusive(state.publicRoot,record.path.slice(1),raw);created.push(record);
    }
    for(const record of packages){const raw=await boundedFile(state.publicRoot,record.path.slice(1),MAX_PACKAGE_BYTES);if(raw.length!==record.bytes||sha256(raw)!==record.sha256)fail('CATALOG_IMMUTABLE_FILE_CHANGED');}
    newLedger=Buffer.from(JSON.stringify({schemaVersion:1,packages},null,2)+'\n');
    await replace(siteRoot,LEDGER,newLedger,state.ledgerRaw);ledgerWritten=true;
    // Publish the mutable index only after every immutable file is present.
    await replace(state.publicRoot,INDEX_PATH.slice(1),drop.indexRaw,state.indexRaw);
    return result;
  }catch(error){
    if(ledgerWritten){if(state.ledgerRaw)await replace(siteRoot,LEDGER,state.ledgerRaw,newLedger);else{if(!isDeepStrictEqual(await boundedFile(siteRoot,LEDGER,MAX_INDEX_BYTES),newLedger))fail('CATALOG_ROLLBACK_CONFLICT');await unlink(path.join(siteRoot,LEDGER));}}
    for(const record of created){const raw=await boundedFile(state.publicRoot,record.path.slice(1),MAX_PACKAGE_BYTES);if(sha256(raw)!==record.sha256)fail('CATALOG_ROLLBACK_CONFLICT');await unlink(path.join(state.publicRoot,record.path.slice(1)));}
    throw error;
  }finally{await lock.close();await unlink(path.join(siteRoot,'.local','catalog-import.lock'));}
}
export async function copyPublicCatalog(siteRoot,distRoot){
  const state=await publicCatalogState(siteRoot);
  const expected=new Set(state.catalog?[INDEX_PATH.slice(1),...(state.v4Raw?[V4_INDEX_PATH.slice(1)]:[]),...state.packages.map(record=>record.path.slice(1))]:[]);
  for(const dir of ['catalog','downloads'])if(await optionalStat(path.join(distRoot,dir)))for(const file of await treeFiles(path.join(distRoot,dir)))if(!expected.has(`${dir}/${file}`))fail('CATALOG_DIST_FILE_UNREGISTERED');
  if(!state.catalog)return state;
  for(const name of expected){
    const raw=name===INDEX_PATH.slice(1)?state.indexRaw:name===V4_INDEX_PATH.slice(1)?state.v4Raw:await boundedFile(state.publicRoot,name,MAX_PACKAGE_BYTES);
    const record=state.packages.find(item=>item.path===`/${name}`);
    if(record&&(raw.length!==record.bytes||sha256(raw)!==record.sha256))fail('CATALOG_INPUT_CHANGED');
    await ensureParents(distRoot,name);const target=await safePath(distRoot,name,{missing:true});
    if(record&&await optionalStat(target)){const previous=await boundedFile(distRoot,name,MAX_PACKAGE_BYTES);if(!raw.equals(previous))fail('CATALOG_DIST_IMMUTABLE_CHANGED');}
    if((name===INDEX_PATH.slice(1)||name===V4_INDEX_PATH.slice(1))&&!(await boundedFile(state.publicRoot,name,MAX_INDEX_BYTES)).equals(raw))fail('CATALOG_INPUT_CHANGED');
    await writeFile(target,raw);
  }
  const after=await publicCatalogState(siteRoot);
  if(!isDeepStrictEqual(after.indexRaw,state.indexRaw)||!isDeepStrictEqual(after.v4Raw,state.v4Raw)||!isDeepStrictEqual(after.ledgerRaw,state.ledgerRaw))fail('CATALOG_INPUT_CHANGED');
  return state;
}
