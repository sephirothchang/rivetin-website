import { mkdir, lstat, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundedFile, copyPublicCatalog, publicCatalogState, safePath } from './catalog-files.mjs';
import { INDEX_PATH, MAX_INDEX_BYTES, MAX_PACKAGE_BYTES, MAX_TOTAL_BYTES, exact, fail, sha256, validHash, packagePath, parsePackagePath, compareVersions, parseJson } from './catalog-contract.mjs';
import { V4_INDEX_PATH, validateV4Catalog, validateV4Package, validateV4Transition } from './catalog-v4-contract.mjs';
import { RELEASE_REQUEST, MAX_RELEASE_BYTES, validateReleaseRequest } from './catalog-release-contract.mjs';

async function files(root){
  const rootStat=await lstat(root);if(!rootStat.isDirectory()||rootStat.isSymbolicLink())fail('CATALOG_PATH_INVALID');
  const found=[];let total=0;
  async function visit(relative=''){
    const dir=relative?await safePath(root,relative,{directory:true}):root;
    for(const entry of await readdir(dir,{withFileTypes:true})){
      const name=relative?`${relative}/${entry.name}`:entry.name;
      if(entry.isSymbolicLink())fail('CATALOG_PATH_INVALID');
      if(entry.isDirectory())await visit(name);
      else{const info=await lstat(await safePath(root,name));total+=info.size;if(found.length>=501||total>MAX_TOTAL_BYTES)fail('CATALOG_SITE_SIZE_LIMIT');found.push(name);}
    }
  }
  await visit();return found;
}

export async function frozenV4Drop(dropRoot,stageHash,baseHash,releaseRequestHash=null){
  if(!path.isAbsolute(dropRoot)||!validHash(stageHash)||!validHash(baseHash))fail('CATALOG_FROZEN_INPUT_REQUIRED');
  const stageRaw=await boundedFile(dropRoot,'stage.json',256*1024);
  if(sha256(stageRaw)!==stageHash)fail('CATALOG_STAGE_HASH_MISMATCH');
  const stage=parseJson(stageRaw,256*1024);
  if(!exact(stage,['schemaVersion','preparedAt','catalogPath','baseCatalogSHA256','indexPath','indexSHA256','packages','candidateOnly'])||stage.schemaVersion!==1||stage.candidateOnly!==true||stage.catalogPath!=='catalog/v4/plugins.json'||stage.indexPath!==V4_INDEX_PATH||stage.baseCatalogSHA256!==baseHash||!validHash(stage.indexSHA256)||typeof stage.preparedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(stage.preparedAt)||!Number.isFinite(Date.parse(stage.preparedAt))||!Array.isArray(stage.packages)||stage.packages.length>500)fail('CATALOG_V4_STAGE_INVALID');
  const indexRaw=await boundedFile(dropRoot,V4_INDEX_PATH.slice(1),MAX_INDEX_BYTES);
  if(sha256(indexRaw)!==stage.indexSHA256)fail('CATALOG_INDEX_HASH_MISMATCH');
  const catalog=validateV4Catalog(parseJson(indexRaw,MAX_INDEX_BYTES)),seen=new Set(),packages=[];
  for(const item of stage.packages){
    if(!exact(item,['id','version','downloadPath','sha256','bytes'])||item.downloadPath!==packagePath(item.id,item.version)||!validHash(item.sha256)||!Number.isSafeInteger(item.bytes)||item.bytes<=0||item.bytes>MAX_PACKAGE_BYTES||seen.has(item.id))fail('CATALOG_STAGE_PACKAGE_INVALID');
    seen.add(item.id);const entry=catalog.plugins.find(p=>p.id===item.id&&p.version===item.version&&p.status==='published');
    if(!entry||entry.downloadPath!==item.downloadPath||entry.sha256!==item.sha256)fail('CATALOG_STAGE_INDEX_MISMATCH');
    const raw=await boundedFile(dropRoot,item.downloadPath.slice(1),MAX_PACKAGE_BYTES);
    if(raw.length!==item.bytes||sha256(raw)!==item.sha256)fail('CATALOG_PACKAGE_HASH_MISMATCH');
    validateV4Package(raw,entry);packages.push({path:item.downloadPath,sha256:item.sha256,bytes:item.bytes});
  }
  let releaseRequest=null,releaseRequestRaw=null;
  if(releaseRequestHash!==null){
    if(!validHash(releaseRequestHash))fail('CATALOG_RELEASE_REQUEST_INVALID');releaseRequestRaw=await boundedFile(dropRoot,RELEASE_REQUEST,MAX_RELEASE_BYTES);
    if(sha256(releaseRequestRaw)!==releaseRequestHash)fail('CATALOG_RELEASE_REQUEST_CHANGED');releaseRequest=validateReleaseRequest(parseJson(releaseRequestRaw,MAX_RELEASE_BYTES),{stageHash,indexHash:stage.indexSHA256,indexBytes:indexRaw.length});
  }
  const expected=new Set(['stage.json',V4_INDEX_PATH.slice(1),...packages.map(p=>p.path.slice(1)),...(releaseRequest?[RELEASE_REQUEST]:[])]),actual=await files(dropRoot);
  if(actual.length!==expected.size||actual.some(name=>!expected.has(name)))fail('CATALOG_DROP_FILE_UNREGISTERED');
  return {stage,stageRaw,indexRaw,catalog,packages,dropRoot,releaseRequest,releaseRequestRaw,releaseRequestHash};
}

// Staging is deliberately confined to a new ignored directory. It cannot modify
// public/, the source ledger, dist/, or any existing deployed catalog.
export async function stageV4({siteRoot,dropRoot,stageHash,baseHash,output,previousV4=null,releaseRequestHash=null}){
  const drop=await frozenV4Drop(dropRoot,stageHash,baseHash,releaseRequestHash);
  if(!path.isAbsolute(siteRoot)||!path.isAbsolute(output))fail('CATALOG_PATH_INVALID');
  const local=path.join(siteRoot,'.local'),resolved=path.resolve(output),prefix=path.resolve(local)+path.sep;
  if(!resolved.startsWith(prefix)||path.dirname(resolved)!==path.resolve(local))fail('CATALOG_IGNORED_OUTPUT_REQUIRED');
  await safePath(siteRoot,'.local',{directory:true});
  const state=await publicCatalogState(siteRoot);
  if(!state.catalog)fail('CATALOG_V3_REQUIRED');
  const publicationPending=Boolean(state.releaseRaw&&!state.v4Raw.equals(drop.indexRaw));
  if(publicationPending&&!drop.releaseRequest)fail('CATALOG_RELEASE_REQUEST_REQUIRED');
  if(drop.releaseRequest&&drop.releaseRequest.baseReleaseSHA256!==(state.releaseRaw?sha256(state.releaseRaw):null))fail('CATALOG_RELEASE_BASE_CHANGED');
  if(state.v4Catalog){if(sha256(state.v4Raw)!==baseHash&&!state.v4Raw.equals(drop.indexRaw))fail('CATALOG_V4_BASE_CHANGED');validateV4Transition(state.v4Catalog,drop.catalog);}
  else if(previousV4){validateV4Catalog(previousV4);validateV4Transition(previousV4,drop.catalog);}
  const ledger=new Map(state.packages.map(record=>[record.path,record]));
  for(const record of drop.packages){const old=ledger.get(record.path);if(old&&(old.sha256!==record.sha256||old.bytes!==record.bytes))fail('CATALOG_SAME_VERSION_IMMUTABLE');ledger.set(record.path,record);}
  for(const entry of drop.catalog.plugins.filter(p=>p.status==='published')){
    const record=ledger.get(entry.downloadPath);if(!record||record.sha256!==entry.sha256)fail('CATALOG_PUBLISHED_FILE_MISSING');
    if(state.packages.map(old=>parsePackagePath(old.path)).some(old=>old.id===entry.id&&compareVersions(entry.version,old.version)<0))fail('CATALOG_VERSION_DOWNGRADE');
    if(!drop.packages.some(p=>p.path===entry.downloadPath))validateV4Package(await boundedFile(state.publicRoot,entry.downloadPath.slice(1),MAX_PACKAGE_BYTES),entry);
  }
  await mkdir(resolved); // exclusive: do not overwrite any existing staging output
  await copyPublicCatalog(siteRoot,resolved,{omitCurrentRelease:publicationPending});
  for(const record of drop.packages){
    const raw=await boundedFile(dropRoot,record.path.slice(1),MAX_PACKAGE_BYTES);
    if(raw.length!==record.bytes||sha256(raw)!==record.sha256)fail('CATALOG_INPUT_CHANGED');
    if(state.packages.some(old=>old.path===record.path))continue;
    const target=path.join(resolved,...record.path.slice(1).split('/'));
    await mkdir(path.dirname(target),{recursive:true});await writeFile(target,raw,{flag:'wx'});
  }
  if(!(await boundedFile(dropRoot,V4_INDEX_PATH.slice(1),MAX_INDEX_BYTES)).equals(drop.indexRaw))fail('CATALOG_INPUT_CHANGED');
  const target=path.join(resolved,'catalog','v4');if(!state.v4Raw)await mkdir(target);await writeFile(path.join(target,'plugins.json'),drop.indexRaw,{flag:state.v4Raw?'w':'wx'});
  const legacy=await boundedFile(resolved,INDEX_PATH.slice(1),MAX_INDEX_BYTES);
  if(!legacy.equals(state.indexRaw))fail('CATALOG_V3_CHANGED');
  for(const record of state.packages){const raw=await boundedFile(resolved,record.path.slice(1),MAX_PACKAGE_BYTES);if(raw.length!==record.bytes||sha256(raw)!==record.sha256)fail('CATALOG_IMMUTABLE_FILE_CHANGED');}
  return {result:'PASS',indexPath:V4_INDEX_PATH,indexSHA256:sha256(drop.indexRaw),legacyIndexSHA256:sha256(legacy),retained:state.packages.length,added:drop.packages.filter(p=>!state.packages.some(old=>old.path===p.path)).length,published:drop.catalog.plugins.filter(p=>p.status==='published').length,output:resolved,...(drop.releaseRequest?{publicationPending:true,publicationId:null}:{})};
}

async function main(args){
  const values={};for(let i=0;i<args.length;i++){const key=args[i];if(!['--drop','--stage-sha256','--base-sha256','--output','--release-request-sha256'].includes(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))fail('CATALOG_ARGUMENT_INVALID');values[key]=args[++i];}
  if(!values['--drop']||!values['--stage-sha256']||!values['--base-sha256']||!values['--output'])fail('CATALOG_ARGUMENT_INVALID');
  console.log(JSON.stringify(await stageV4({siteRoot:fileURLToPath(new URL('../',import.meta.url)),dropRoot:values['--drop'],stageHash:values['--stage-sha256'],baseHash:values['--base-sha256'],releaseRequestHash:values['--release-request-sha256']||null,output:values['--output']}),null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(/^[A-Z][A-Z0-9_]+$/u.test(error.message)?error.message:'CATALOG_V4_STAGING_FAILED');process.exitCode=1;});
