import { isDeepStrictEqual } from 'node:util';
import { exact, fail, validId, validHash, packagePath, parsePackagePath, compareVersions, validatePackage, validSchema2Minimum } from './catalog-contract.mjs';
import { compareReleaseVersions, validReleaseVersion } from './release-version.mjs';
import { validateStandardZip } from './standard-zip.mjs';

export const V4_INDEX_PATH='/catalog/v4/plugins.json';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const localized=(value,max)=>exact(value,['zh-CN','en-US'])&&Object.values(value).every(item=>text(item,max));
const build=/^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})(?:-[a-z0-9]+(?:[.-][a-z0-9]+)*)?$/u;
const buildList=value=>Array.isArray(value)&&value.length>0&&value.length<=20&&new Set(value).size===value.length&&value.every(x=>typeof x==='string'&&x===x.trim()&&x.length<=100&&build.test(x));
const fields=['id','version','frameworkApi','status','downloadPath','sha256','name','description','author','license','permissions','compatibility'];
export function validateV4Compatibility(value){
  const allowed=['schemaVersion','frameworkApi','tower','towerBuilds','frameworkMinVersion','frameworkMaxVersionExclusive','smtx'];
  if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key))||value.schemaVersion!==2||value.frameworkApi!==1||!text(value.tower,120)||!buildList(value.towerBuilds)||!validSchema2Minimum(value))fail('CATALOG_V4_COMPATIBILITY_INVALID');
  if(value.smtx!==undefined&&value.smtx!=='none'&&(!exact(value.smtx,['product','scope','builds'])||value.smtx.product!=='SMTX_OS'||value.smtx.scope!=='all-managed-product-clusters'||!buildList(value.smtx.builds)))fail('CATALOG_V4_COMPATIBILITY_INVALID');
  return value;
}
export function validateV4Catalog(value){
  if(!exact(value,['schemaVersion','plugins'])||value.schemaVersion!==4||!Array.isArray(value.plugins)||value.plugins.length>500)fail('CATALOG_V4_REQUIRED');
  // A plugin id may keep its historical legacy row and standard-ZIP rows for
  // different versions (or the legacy row and its ZIP successor for the same
  // version). Only exact duplicate (id, version, extension) rows are refused.
  const seen=new Set();
  for(const item of value.plugins){
    if(!exact(item,fields)||!validId(item.id)||!validReleaseVersion(item.version)||item.frameworkApi!==1||!['draft','published'].includes(item.status)||!localized(item.name,120)||!localized(item.description,500)||!text(item.author,120)||item.license!=='MIT'||!Array.isArray(item.permissions)||item.permissions.length>20||new Set(item.permissions).size!==item.permissions.length||item.permissions.some(p=>typeof p!=='string'||p.length>100||!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(p)))fail('CATALOG_V4_ENTRY_INVALID');
    validateV4Compatibility(item.compatibility);
    if(item.status==='published'){
      let parsed;
      try{parsed=parsePackagePath(item.downloadPath);}catch{fail('CATALOG_PUBLICATION_INVALID');}
      if(parsed.id!==item.id||parsed.version!==item.version||!validHash(item.sha256))fail('CATALOG_PUBLICATION_INVALID');
      const key=`${item.id}|${item.version}|${parsed.extension}`;
      if(seen.has(key))fail('CATALOG_DUPLICATE_ID');
      seen.add(key);
    }else if(item.downloadPath!==null||item.sha256!==null)fail('CATALOG_PUBLICATION_INVALID');
  }
  return value;
}
const normalized=item=>({...item,compatibility:{...item.compatibility,smtx:item.compatibility.smtx??'none'}});
// The deprecated upper-bound field is kept raw for older readers in the catalog
// and immutable package bytes. It has no runtime semantics, so it is not part of
// the package-versus-catalog identity comparison; every other field is exact.
const comparable=item=>{
  const value=normalized(item),{frameworkMaxVersionExclusive,...compatibility}=value.compatibility;
  return {id:value.id,version:value.version,frameworkApi:value.frameworkApi,name:value.name,description:value.description,
    author:value.author,license:value.license,permissions:value.permissions,compatibility};
};
const maxVersion=rows=>rows.filter(row=>row.status==='published').map(row=>row.version)
  .reduce((max,version)=>max!==null&&compareReleaseVersions(version,max)<=0?max:version,null);
// Delisting only changes the index; immutable packages stay in the ledger.
// Reusing a published (id, version, extension) with different raw metadata is
// blocked, and no plugin's highest published version may move backwards.
export function validateV4Transition(previous,next){
  const previousRows=new Map();
  for(const row of previous?.plugins??[]){if(!previousRows.has(row.id))previousRows.set(row.id,[]);previousRows.get(row.id).push(row);}
  for(const [id,oldRows] of previousRows){
    const oldMax=maxVersion(oldRows),nextRows=next.plugins.filter(row=>row.id===id),nextMax=maxVersion(nextRows);
    if(oldMax!==null&&nextMax!==null&&compareReleaseVersions(nextMax,oldMax)<0)fail('CATALOG_VERSION_DOWNGRADE');
    for(const old of oldRows){
      if(old.status!=='published')continue;
      const extension=parsePackagePath(old.downloadPath).extension;
      const item=nextRows.find(row=>row.version===old.version&&row.status==='published'&&(()=>{try{return parsePackagePath(row.downloadPath).extension===extension;}catch{return false;}})());
      if(item&&!isDeepStrictEqual(normalized(item),normalized(old)))fail('CATALOG_SAME_VERSION_IMMUTABLE');
    }
  }
}
export function validateV4Package(raw,expected){
  if(Buffer.isBuffer(raw)&&raw.length>=4&&raw.readUInt32LE(0)===0x04034b50){
    const validated=validateStandardZip(raw);
    const candidate=normalized({...validated.identity,frameworkApi:1,status:'published',
      downloadPath:packagePath(validated.identity.id,validated.identity.version,'zip'),sha256:validated.sha256});
    try{validateV4Catalog({schemaVersion:4,plugins:[candidate]});}catch{fail('CATALOG_V4_ENTRY_INVALID');}
    if(expected&&!isDeepStrictEqual(comparable(candidate),comparable(expected)))fail('CATALOG_V4_PACKAGE_MISMATCH');
    return candidate;
  }
  const actual=validatePackage(raw,undefined,value=>validateV4Catalog({...value,schemaVersion:4}));
  if(expected&&!isDeepStrictEqual(normalized(actual),normalized(expected)))fail('CATALOG_V4_PACKAGE_MISMATCH');
  return actual;
}
// Legacy v3 catalogs still require three numeric parts; this helper is exported
// only so callers that need the historical comparator can share it.
export const compareNumericVersions=compareVersions;
