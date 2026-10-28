import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundedFile,safePath } from './catalog-files.mjs';
import { SITE,exact,fail,sha256,validHash,parseJson,MAX_INDEX_BYTES,MAX_PACKAGE_BYTES,parsePackagePath } from './catalog-contract.mjs';
import { MAX_RELEASE_BYTES,validateRelease,validatePublicationOutput,validReleaseTime,encode } from './catalog-release-contract.mjs';
import { frozenV4Drop } from './catalog-v4-staging.mjs';
import { download,ignoredOutput } from './readback-catalog.mjs';

export function releaseRequests(manifest){
 validatePublicationOutput(manifest);
 const names=[['catalog.plugins.json','catalog.receipt.json'],['catalog.release.json','catalog.release.receipt.json'],['catalog.snapshot.plugins.json','catalog.snapshot.receipt.json'],['catalog.snapshot.release.json','catalog.snapshot.release.receipt.json']];
 return [...manifest.files.map((r,i)=>({...r,body:names[i][0],receipt:names[i][1],max:i%2?MAX_RELEASE_BYTES:MAX_INDEX_BYTES})),...manifest.packages.map(r=>{const p=parsePackagePath(r.path),stem=p.id+'-'+p.version;return {...r,body:stem+'.rivetin.json',receipt:stem+'.receipt.json',max:MAX_PACKAGE_BYTES};})];
}
function verifySet(manifest,proofs,{notBefore,now=Date.now()}={}){
 const metadata=validateRelease(parseJson(proofs[1].raw,MAX_RELEASE_BYTES),proofs[0].raw),boundary=Math.max(Date.parse(notBefore),Date.parse(metadata.publishedAt));
 if(metadata.publicationId!==manifest.publicationId||!proofs[0].raw.equals(proofs[2].raw)||!proofs[1].raw.equals(proofs[3].raw))fail('CATALOG_RELEASE_PROOF_BINDING');
 let verifiedAt=0;
 for(const {request,raw,receipt} of proofs){
  if(!exact(receipt,['schemaVersion','site','path','status','sha256','bytes','verifiedAt'])||receipt.schemaVersion!==1||receipt.site!==SITE||receipt.path!==request.path||receipt.status!==200||receipt.sha256!==request.sha256||receipt.bytes!==request.bytes||sha256(raw)!==request.sha256||raw.length!==request.bytes)fail('CATALOG_RELEASE_RECEIPT_MISMATCH');
  const time=Date.parse(receipt.verifiedAt);if(!validReleaseTime(receipt.verifiedAt)||!Number.isFinite(boundary)||!Number.isFinite(now)||time<boundary||now-time>86400000||time>now+300000)fail('CATALOG_RELEASE_RECEIPT_TIME');verifiedAt=Math.max(verifiedAt,time);
 }
 return {metadata,verifiedAt:new Date(verifiedAt).toISOString(),publicationId:manifest.publicationId};
}
export async function frozenPublicationOutput({dropRoot,stageHash,baseHash,releaseRequestHash,publicationOutputFile,publicationOutputHash}){
 if(!path.isAbsolute(publicationOutputFile)||!validHash(publicationOutputHash))fail('CATALOG_RELEASE_OUTPUT_REQUIRED');
 const drop=await frozenV4Drop(dropRoot,stageHash,baseHash,releaseRequestHash);if(!drop.releaseRequest)fail('CATALOG_RELEASE_REQUEST_REQUIRED');
 const raw=await boundedFile(path.dirname(publicationOutputFile),path.basename(publicationOutputFile),256*1024);if(sha256(raw)!==publicationOutputHash)fail('CATALOG_RELEASE_OUTPUT_CHANGED');
 const manifest=validatePublicationOutput(parseJson(raw,256*1024),{request:drop.releaseRequest,stageHash,releaseRequestHash,packages:drop.packages});return {drop,manifest,raw};
}
export async function verifyReleaseProof({manifest,proofRoot,notBefore,now=Date.now()}){
 const proofs=[];for(const request of releaseRequests(manifest))proofs.push({request,raw:await boundedFile(proofRoot,request.body,request.max),receipt:parseJson(await boundedFile(proofRoot,request.receipt,16384),16384)});
 return verifySet(manifest,proofs,{notBefore,now});
}
export async function readbackRelease(options){
 const {manifest,drop}=await frozenPublicationOutput(options);await ignoredOutput(options.output);
 const proofs=[];for(const request of releaseRequests(manifest))proofs.push({request,...await download(request.path,request,request.max,options.fetcher||fetch)});
 const verification=verifySet(manifest,proofs,{notBefore:drop.stage.preparedAt});
 await mkdir(options.output); // exclusive proof directory; no mixing with old receipts
 for(const {request,raw,receipt} of proofs)for(const [name,bytes] of [[request.body,raw],[request.receipt,encode(receipt)]])await writeFile(await safePath(options.output,name,{missing:true}),bytes,{flag:'wx'});
 return {publicationId:manifest.publicationId,httpsVerified:true,verifiedAt:verification.verifiedAt,receipts:proofs.map(p=>p.receipt)};
}
async function main(args){
 const map={'--drop':'dropRoot','--stage-sha256':'stageHash','--base-sha256':'baseHash','--release-request-sha256':'releaseRequestHash','--publication-output':'publicationOutputFile','--publication-output-sha256':'publicationOutputHash','--output':'output'},values={};
 for(let i=0;i<args.length;i++){const key=map[args[i]];if(!key||values[key]||!args[i+1]||args[i+1].startsWith('--'))fail('CATALOG_ARGUMENT_INVALID');values[key]=args[++i];}if(Object.keys(values).length!==7)fail('CATALOG_ARGUMENT_INVALID');console.log(JSON.stringify(await readbackRelease(values),null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(e=>{console.error(/^[A-Z][A-Z0-9_]+$/u.test(e.code||'')?e.code:'CATALOG_RELEASE_READBACK_FAILED');process.exitCode=1;});
