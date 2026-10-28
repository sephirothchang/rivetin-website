import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const SITE='https://rivetin.dev';
export const INDEX_PATH='/catalog/plugins.json';
export const MAX_INDEX_BYTES=512*1024;
export const MAX_PACKAGE_BYTES=16*1024*1024;
export const MAX_TOTAL_BYTES=512*1024*1024;
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const fail=code=>{throw Object.assign(new Error(code),{code});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const exact=(value,keys)=>object(value)&&isDeepStrictEqual(Object.keys(value).sort(),[...keys].sort());
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const localized=(value,max)=>exact(value,['zh-CN','en-US'])&&Object.values(value).every(item=>text(item,max));
export const validId=id=>typeof id==='string'&&id.length<=100&&/^rivetin-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id);
export const validVersion=version=>typeof version==='string'&&/^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})$/u.test(version);
export const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
export const compareVersions=(a,b)=>a.split('.').map(Number).map((part,i)=>part-Number(b.split('.')[i])).find(part=>part!==0)||0;
export function packagePath(id,version){
  if(!validId(id)||!validVersion(version))fail('CATALOG_IDENTITY_INVALID');
  return `/downloads/plugins/${id}/${version}/${id}-${version}.rivetin.json`;
}
export function parsePackagePath(value){
  if(typeof value!=='string')fail('CATALOG_PATH_INVALID');
  const match=/^\/downloads\/plugins\/(rivetin-[a-z0-9]+(?:-[a-z0-9]+)*)\/([^/]+)\/([^/]+)$/u.exec(value);
  if(!match||value!==packagePath(match[1],match[2]))fail('CATALOG_PATH_INVALID');
  return {id:match[1],version:match[2]};
}
export function parseJson(raw,max){
  if(!Buffer.isBuffer(raw)||!raw.length||raw.length>max)fail('CATALOG_SIZE_LIMIT');
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{fail('CATALOG_JSON_INVALID');}
}
export function compatibility(value){
  const allowed=['frameworkApi','tower','towerBuilds','frameworkMinVersion','frameworkMaxVersionExclusive'];
  if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key))||value.frameworkApi!==1||!text(value.tower,120))fail('CATALOG_COMPATIBILITY_INVALID');
  if(value.towerBuilds!==undefined&&(!Array.isArray(value.towerBuilds)||value.towerBuilds.length>20||new Set(value.towerBuilds).size!==value.towerBuilds.length||value.towerBuilds.some(build=>typeof build!=='string'||build.length>100||!/^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})(?:-[a-z0-9]+(?:[.-][a-z0-9]+)*)?$/u.test(build))))fail('CATALOG_COMPATIBILITY_INVALID');
  for(const key of ['frameworkMinVersion','frameworkMaxVersionExclusive'])if(value[key]!==undefined&&!validVersion(value[key]))fail('CATALOG_COMPATIBILITY_INVALID');
  if(value.frameworkMinVersion&&value.frameworkMaxVersionExclusive&&compareVersions(value.frameworkMinVersion,value.frameworkMaxVersionExclusive)>=0)fail('CATALOG_COMPATIBILITY_INVALID');
  return value;
}
const fields=['id','version','frameworkApi','status','downloadPath','sha256','name','description','author','license','permissions','compatibility'];
export function validateCatalog(value){
  if(!exact(value,['schemaVersion','plugins'])||value.schemaVersion!==3||!Array.isArray(value.plugins)||value.plugins.length>500)fail('CATALOG_V3_REQUIRED');
  const seen=new Set();
  for(const item of value.plugins){
    if(!exact(item,fields)||!validId(item.id)||!validVersion(item.version)||item.frameworkApi!==1||!['draft','published'].includes(item.status)||!localized(item.name,120)||!localized(item.description,500)||!text(item.author,120)||item.license!=='MIT'||!Array.isArray(item.permissions)||item.permissions.length>20||new Set(item.permissions).size!==item.permissions.length||item.permissions.some(p=>typeof p!=='string'||p.length>100||!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(p)))fail('CATALOG_ENTRY_INVALID');
    compatibility(item.compatibility);
    if(seen.has(item.id))fail('CATALOG_DUPLICATE_ID');seen.add(item.id);
    if(item.status==='published'?(item.downloadPath!==packagePath(item.id,item.version)||!validHash(item.sha256)||!item.compatibility.towerBuilds?.length):(item.downloadPath!==null||item.sha256!==null))fail('CATALOG_PUBLICATION_INVALID');
  }
  return value;
}
function safeEmbeddedPath(value){
  return typeof value==='string'&&value.length<=180&&/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*$/u.test(value)&&value.split('/').every(part=>!['.','..'].includes(part)&&!/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/iu.test(part));
}
// The framework owns settings/SSH semantics. Website checks data and file integrity;
// it never imports or executes any embedded plugin code.
export function validatePackage(raw,expected){
  const value=parseJson(raw,MAX_PACKAGE_BYTES);
  if(!exact(value,['format','manifest','files'])||value.format!=='rivetin-package-v1'||!object(value.manifest)||!Array.isArray(value.files)||!value.files.length||value.files.length>100)fail('CATALOG_PACKAGE_INVALID');
  const manifest=value.manifest;
  if(manifest.manifestVersion!==1||!validId(manifest.id)||!validVersion(manifest.version)||!object(manifest.frontend)||manifest.frontend.format!=='rivetin-global-v1'||!safeEmbeddedPath(manifest.frontend.entry)||!manifest.frontend.entry.endsWith('.js'))fail('CATALOG_PACKAGE_MANIFEST_INVALID');
  const metadata={id:manifest.id,version:manifest.version,frameworkApi:manifest.compatibility?.frameworkApi};
  for(const key of ['name','description','author','license','permissions','compatibility'])metadata[key]=manifest[key];
  const candidate={...metadata,status:'published',downloadPath:packagePath(manifest.id,manifest.version),sha256:sha256(raw)};
  validateCatalog({schemaVersion:3,plugins:[candidate]});
  if(expected&&!isDeepStrictEqual(candidate,expected))fail('CATALOG_PACKAGE_METADATA_MISMATCH');
  const seen=new Set();let total=0;
  for(const file of value.files){
    if(!exact(file,['path','data','sha256'])||!safeEmbeddedPath(file.path)||!/^(web\/.*\.(js|css|json)|LICENSE)$/u.test(file.path)||seen.has(file.path.toLowerCase())||typeof file.data!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(file.data)||!validHash(file.sha256))fail('CATALOG_PACKAGE_FILE_INVALID');
    seen.add(file.path.toLowerCase());const content=Buffer.from(file.data,'base64');total+=content.length;
    if(total>10*1024*1024||sha256(content)!==file.sha256)fail('CATALOG_PACKAGE_INTEGRITY_FAILED');
  }
  if(!seen.has('license')||!seen.has(manifest.frontend.entry.toLowerCase()))fail('CATALOG_PACKAGE_ENTRY_MISSING');
  return candidate;
}
export function validateTransition(previous,next){
  for(const old of previous?.plugins??[]){
    const item=next.plugins.find(p=>p.id===old.id);
    if(old.status==='published'&&(!item||item.status!=='published'))fail('CATALOG_PUBLICATION_REMOVAL');
    if(item&&compareVersions(item.version,old.version)<0)fail('CATALOG_VERSION_DOWNGRADE');
    if(item&&old.status==='published'&&item.version===old.version&&!isDeepStrictEqual(item,old))fail('CATALOG_SAME_VERSION_IMMUTABLE');
  }
}
