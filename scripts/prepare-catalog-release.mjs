import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {boundedFile,optionalStat,exclusive} from './catalog-files.mjs';
import {fail,sha256,validHash,parseJson} from './catalog-contract.mjs';
import {RELEASE_REQUEST,MAX_RELEASE_BYTES,validateReleaseRequest,encode} from './catalog-release-contract.mjs';
import {frozenV4Drop} from './catalog-v4-staging.mjs';
export async function prepareReleaseRequest({dropRoot,stageHash,baseHash,baseReleaseSHA256,requestId}){
 if(baseReleaseSHA256!==null&&!validHash(baseReleaseSHA256))fail('CATALOG_RELEASE_BASE_REQUIRED');
 const prior=await optionalStat(path.join(dropRoot,RELEASE_REQUEST));
 if(prior){const raw=await boundedFile(dropRoot,RELEASE_REQUEST,MAX_RELEASE_BYTES),hash=sha256(raw),drop=await frozenV4Drop(dropRoot,stageHash,baseHash,hash);if(drop.releaseRequest.baseReleaseSHA256!==baseReleaseSHA256||requestId&&drop.releaseRequest.requestId!==requestId)fail('CATALOG_RELEASE_REQUEST_REUSED');return {result:'existing-request',requestId:drop.releaseRequest.requestId,releaseRequestSHA256:hash};}
 const drop=await frozenV4Drop(dropRoot,stageHash,baseHash),request=validateReleaseRequest({schemaVersion:1,requestId:requestId||randomUUID(),stageSHA256:stageHash,catalogPath:drop.stage.indexPath,indexSHA256:drop.stage.indexSHA256,indexBytes:drop.indexRaw.length,baseReleaseSHA256,candidateOnly:true}),raw=encode(request);
 await exclusive(dropRoot,RELEASE_REQUEST,raw);return {result:'prepared-request',requestId:request.requestId,releaseRequestSHA256:sha256(raw)};
}
async function main(args){const allowed=['--drop','--stage-sha256','--base-sha256','--base-release-sha256','--request-id'],v={};for(let i=0;i<args.length;i++){if(!allowed.includes(args[i])||v[args[i]]||!args[i+1]||args[i+1].startsWith('--'))fail('CATALOG_ARGUMENT_INVALID');const key=args[i];v[key]=args[++i];}if(!v['--drop']||!v['--stage-sha256']||!v['--base-sha256']||!v['--base-release-sha256'])fail('CATALOG_ARGUMENT_INVALID');console.log(JSON.stringify(await prepareReleaseRequest({dropRoot:v['--drop'],stageHash:v['--stage-sha256'],baseHash:v['--base-sha256'],baseReleaseSHA256:v['--base-release-sha256']==='none'?null:v['--base-release-sha256'],requestId:v['--request-id']})));}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(e=>{console.error(/^[A-Z][A-Z0-9_]+$/u.test(e.code||'')?e.code:'CATALOG_RELEASE_PREPARE_FAILED');process.exitCode=1;});
