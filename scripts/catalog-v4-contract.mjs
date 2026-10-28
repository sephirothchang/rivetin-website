import { isDeepStrictEqual } from 'node:util';
import { exact, fail, validId, validVersion, validHash, packagePath, compareVersions, validatePackage } from './catalog-contract.mjs';

export const V4_INDEX_PATH='/catalog/v4/plugins.json';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const localized=(value,max)=>exact(value,['zh-CN','en-US'])&&Object.values(value).every(item=>text(item,max));
const build=/^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})(?:-[a-z0-9]+(?:[.-][a-z0-9]+)*)?$/u;
const buildList=value=>Array.isArray(value)&&value.length>0&&value.length<=20&&new Set(value).size===value.length&&value.every(x=>typeof x==='string'&&x===x.trim()&&x.length<=100&&build.test(x));
const fields=['id','version','frameworkApi','status','downloadPath','sha256','name','description','author','license','permissions','compatibility'];
export function validateV4Compatibility(value){
  const allowed=['schemaVersion','frameworkApi','tower','towerBuilds','frameworkMinVersion','frameworkMaxVersionExclusive','smtx'];
  if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key))||value.schemaVersion!==2||value.frameworkApi!==1||!text(value.tower,120)||!buildList(value.towerBuilds)||!validVersion(value.frameworkMinVersion)||!validVersion(value.frameworkMaxVersionExclusive)||compareVersions(value.frameworkMinVersion,value.frameworkMaxVersionExclusive)>=0)fail('CATALOG_V4_COMPATIBILITY_INVALID');
  if(value.smtx!==undefined&&value.smtx!=='none'&&(!exact(value.smtx,['product','scope','builds'])||value.smtx.product!=='SMTX_OS'||value.smtx.scope!=='all-managed-product-clusters'||!buildList(value.smtx.builds)))fail('CATALOG_V4_COMPATIBILITY_INVALID');
  return value;
}
export function validateV4Catalog(value){
  if(!exact(value,['schemaVersion','plugins'])||value.schemaVersion!==4||!Array.isArray(value.plugins)||value.plugins.length>500)fail('CATALOG_V4_REQUIRED');
  const seen=new Set();
  for(const item of value.plugins){
    if(!exact(item,fields)||!validId(item.id)||!validVersion(item.version)||item.frameworkApi!==1||!['draft','published'].includes(item.status)||!localized(item.name,120)||!localized(item.description,500)||!text(item.author,120)||item.license!=='MIT'||!Array.isArray(item.permissions)||item.permissions.length>20||new Set(item.permissions).size!==item.permissions.length||item.permissions.some(p=>typeof p!=='string'||p.length>100||!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(p)))fail('CATALOG_V4_ENTRY_INVALID');
    validateV4Compatibility(item.compatibility);
    if(seen.has(item.id))fail('CATALOG_DUPLICATE_ID');seen.add(item.id);
    if(item.status==='published'?(item.downloadPath!==packagePath(item.id,item.version)||!validHash(item.sha256)):(item.downloadPath!==null||item.sha256!==null))fail('CATALOG_PUBLICATION_INVALID');
  }
  return value;
}
const normalized=item=>({...item,compatibility:{...item.compatibility,smtx:item.compatibility.smtx??'none'}});
// Delisting an entry only changes the index; its immutable package stays in the
// global ledger. Reusing a published version with different metadata is blocked.
export function validateV4Transition(previous,next){
  for(const old of previous?.plugins??[]){
    const item=next.plugins.find(entry=>entry.id===old.id);
    if(item&&compareVersions(item.version,old.version)<0)fail('CATALOG_VERSION_DOWNGRADE');
    if(item&&old.status==='published'&&item.status==='published'&&item.version===old.version&&!isDeepStrictEqual(normalized(item),normalized(old)))fail('CATALOG_SAME_VERSION_IMMUTABLE');
  }
}
export function validateV4Package(raw,expected){
  const actual=validatePackage(raw,undefined,value=>validateV4Catalog({...value,schemaVersion:4}));
  if(expected&&!isDeepStrictEqual(normalized(actual),normalized(expected)))fail('CATALOG_PACKAGE_METADATA_MISMATCH');
  return actual;
}
