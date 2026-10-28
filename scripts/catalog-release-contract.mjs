import { exact, fail, sha256, validHash, MAX_INDEX_BYTES, MAX_PACKAGE_BYTES, parseJson, parsePackagePath } from './catalog-contract.mjs';
import { validateV4Catalog, V4_INDEX_PATH } from './catalog-v4-contract.mjs';

export const RELEASE_PATH='/catalog/v4/release.json';
export const RELEASE_LEDGER='catalog-release-ledger.json';
export const RELEASE_REQUEST='release-stage.json';
export const MAX_RELEASE_BYTES=8192;
export const MAX_RELEASE_LEDGER_BYTES=2*1024*1024;
export const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const iso=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
export const validReleaseTime=iso;
export const shanghaiDate=value=>{if(!iso(value))fail('CATALOG_RELEASE_TIME_INVALID');return new Date(Date.parse(value)+8*60*60*1000).toISOString().slice(2,10).replaceAll('-','');};
export function publicationParts(id){
 const m=typeof id==='string'&&/^ML-V4-(\d{6})\.(0|[1-9]\d{0,14})$/u.exec(id);
 if(!m||!Number.isSafeInteger(Number(m[2])))fail('CATALOG_RELEASE_ID_INVALID');return {day:m[1],revision:Number(m[2])};
}
export const snapshotIndex=id=>{publicationParts(id);return `/catalog/v4/releases/${id}/plugins.json`;};
export const snapshotMetadata=id=>snapshotIndex(id).replace(/plugins\.json$/u,'release.json');

export function validateRelease(value,indexRaw=null){
 if(!exact(value,['metadataSchemaVersion','publicationId','catalogSchemaVersion','catalogPath','catalogSHA256','catalogBytes','snapshotPath','publishedAt'])||value.metadataSchemaVersion!==1||value.catalogSchemaVersion!==4||value.catalogPath!==V4_INDEX_PATH||!validHash(value.catalogSHA256)||!Number.isSafeInteger(value.catalogBytes)||value.catalogBytes<1||value.catalogBytes>MAX_INDEX_BYTES)fail('CATALOG_RELEASE_METADATA_INVALID');
 const id=publicationParts(value.publicationId);
 if(id.day!==shanghaiDate(value.publishedAt)||value.snapshotPath!==snapshotIndex(value.publicationId))fail('CATALOG_RELEASE_METADATA_BINDING');
 if(indexRaw){validateV4Catalog(parseJson(indexRaw,MAX_INDEX_BYTES));if(value.catalogSHA256!==sha256(indexRaw)||value.catalogBytes!==indexRaw.length)fail('CATALOG_RELEASE_INDEX_MISMATCH');}
 return value;
}
export function validateReleaseRequest(value,{stageHash,indexHash,indexBytes}={}){
 if(!exact(value,['schemaVersion','requestId','stageSHA256','catalogPath','indexSHA256','indexBytes','baseReleaseSHA256','candidateOnly'])||value.schemaVersion!==1||value.candidateOnly!==true||!/^\w{8}-\w{4}-4\w{3}-[89ab]\w{3}-\w{12}$/u.test(value.requestId)||!/^[a-f0-9-]+$/u.test(value.requestId)||value.catalogPath!==V4_INDEX_PATH||!validHash(value.stageSHA256)||!validHash(value.indexSHA256)||!Number.isSafeInteger(value.indexBytes)||value.indexBytes<1||value.indexBytes>MAX_INDEX_BYTES||value.baseReleaseSHA256!==null&&!validHash(value.baseReleaseSHA256))fail('CATALOG_RELEASE_REQUEST_INVALID');
 if(stageHash&&value.stageSHA256!==stageHash||indexHash&&value.indexSHA256!==indexHash||indexBytes!==undefined&&value.indexBytes!==indexBytes)fail('CATALOG_RELEASE_REQUEST_MISMATCH');return value;
}
export function releaseLedger(value){
 if(!exact(value,['schemaVersion','currentPublicationId','releases'])||value.schemaVersion!==1||!Array.isArray(value.releases)||value.releases.length>5000)fail('CATALOG_RELEASE_LEDGER_INVALID');
 const ids=new Set();let pending=0;
 for(const r of value.releases){
  if(!exact(r,['publicationId','catalogSchemaVersion','catalogSHA256','catalogBytes','snapshotPath','publishedAt','metadataSHA256','metadataBytes','status','verifiedAt'])||r.catalogSchemaVersion!==4||!validHash(r.catalogSHA256)||!Number.isSafeInteger(r.catalogBytes)||r.catalogBytes<1||r.catalogBytes>MAX_INDEX_BYTES||!validHash(r.metadataSHA256)||!Number.isSafeInteger(r.metadataBytes)||r.metadataBytes<1||r.metadataBytes>MAX_RELEASE_BYTES||!['reserved','local-committed','verified','abandoned'].includes(r.status)||(r.status==='verified'?!iso(r.verifiedAt):r.verifiedAt!==null))fail('CATALOG_RELEASE_LEDGER_INVALID');
  if(ids.has(r.publicationId)||publicationParts(r.publicationId).day!==shanghaiDate(r.publishedAt)||r.snapshotPath!==snapshotIndex(r.publicationId))fail('CATALOG_RELEASE_LEDGER_BINDING');ids.add(r.publicationId);if(r.status==='reserved')pending++;
 }
 if(pending>1||value.currentPublicationId!==null&&!value.releases.some(r=>r.publicationId===value.currentPublicationId&&['local-committed','verified'].includes(r.status)))fail('CATALOG_RELEASE_LEDGER_HEAD_INVALID');return value;
}
export const emptyReleaseLedger=()=>({schemaVersion:1,currentPublicationId:null,releases:[]});
export function encodeReleaseLedger(value){const raw=encode(releaseLedger(value));if(raw.length>MAX_RELEASE_LEDGER_BYTES)fail('CATALOG_RELEASE_LEDGER_SIZE_LIMIT');return raw;}
export function metadataFor(record){return validateRelease({metadataSchemaVersion:1,publicationId:record.publicationId,catalogSchemaVersion:4,catalogPath:V4_INDEX_PATH,catalogSHA256:record.catalogSHA256,catalogBytes:record.catalogBytes,snapshotPath:record.snapshotPath,publishedAt:record.publishedAt});}

// Pure reservation plan: callers must persist it under the existing publisher locks.
export function reserveRelease(value,indexRaw,publishedAt){
 const ledger=structuredClone(releaseLedger(value));validateV4Catalog(parseJson(indexRaw,MAX_INDEX_BYTES));const hash=sha256(indexRaw);
 if(ledger.releases.some(r=>r.status==='reserved'))fail('CATALOG_RELEASE_OUTCOME_UNKNOWN');
 const current=ledger.releases.find(r=>r.publicationId===ledger.currentPublicationId);
 if(current&&current.catalogSHA256===hash&&current.catalogBytes===indexRaw.length)return {reused:true,ledger,record:current,metadata:metadataFor(current)};
 if(ledger.releases.some(r=>r.catalogSHA256===hash&&r.catalogBytes===indexRaw.length&&['local-committed','verified'].includes(r.status)))fail('CATALOG_RELEASE_ROLLBACK_REQUIRED');
 const day=shanghaiDate(publishedAt),revisions=ledger.releases.filter(r=>publicationParts(r.publicationId).day===day).map(r=>publicationParts(r.publicationId).revision),revision=revisions.length?Math.max(...revisions)+1:0;
 if(!Number.isSafeInteger(revision))fail('CATALOG_RELEASE_REVISION_LIMIT');
 const publicationId=`ML-V4-${day}.${revision}`,record={publicationId,catalogSchemaVersion:4,catalogSHA256:hash,catalogBytes:indexRaw.length,snapshotPath:snapshotIndex(publicationId),publishedAt,metadataSHA256:null,metadataBytes:0,status:'reserved',verifiedAt:null};
 const metadata=metadataFor(record),raw=encode(metadata);record.metadataSHA256=sha256(raw);record.metadataBytes=raw.length;ledger.releases.push(record);releaseLedger(ledger);
 return {reused:false,ledger,record,metadata,metadataRaw:raw};
}
export function validatePublicationOutput(value,{request=null,stageHash=null,releaseRequestHash=null,packages=null}={}){
 if(!exact(value,['schemaVersion','requestId','stageSHA256','releaseRequestSHA256','publicationId','publicationState','files','ledger','packages'])||value.schemaVersion!==1||value.publicationState!=='local-committed'||!(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value.requestId))||!validHash(value.stageSHA256)||!validHash(value.releaseRequestSHA256)||!Array.isArray(value.files)||value.files.length!==4||!Array.isArray(value.packages)||value.packages.length>500)fail('CATALOG_RELEASE_OUTPUT_INVALID');
 publicationParts(value.publicationId);
 const validRecord=(r,max)=>exact(r,['path','sha256','bytes'])&&validHash(r.sha256)&&Number.isSafeInteger(r.bytes)&&r.bytes>0&&r.bytes<=max;
 const paths=[V4_INDEX_PATH,RELEASE_PATH,snapshotIndex(value.publicationId),snapshotMetadata(value.publicationId)];
 if(value.files.some((r,i)=>!validRecord(r,i%2?MAX_RELEASE_BYTES:MAX_INDEX_BYTES)||r.path!==paths[i])||value.files[0].sha256!==value.files[2].sha256||value.files[0].bytes!==value.files[2].bytes||value.files[1].sha256!==value.files[3].sha256||value.files[1].bytes!==value.files[3].bytes||!validRecord(value.ledger,MAX_RELEASE_LEDGER_BYTES)||value.ledger.path!==RELEASE_LEDGER)fail('CATALOG_RELEASE_OUTPUT_BINDING');
 const seen=new Set();for(const r of value.packages){if(!validRecord(r,MAX_PACKAGE_BYTES)||seen.has(r.path))fail('CATALOG_RELEASE_OUTPUT_INVALID');parsePackagePath(r.path);seen.add(r.path);}
 if(request&&(value.requestId!==request.requestId||value.files[0].sha256!==request.indexSHA256||value.files[0].bytes!==request.indexBytes)||stageHash&&value.stageSHA256!==stageHash||releaseRequestHash&&value.releaseRequestSHA256!==releaseRequestHash||packages&&JSON.stringify(value.packages)!==JSON.stringify(packages))fail('CATALOG_RELEASE_OUTPUT_MISMATCH');
 return value;
}
