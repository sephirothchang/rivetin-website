import { mkdir, writeFile, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frozenDrop, safePath } from './catalog-files.mjs';
import { SITE, INDEX_PATH, MAX_INDEX_BYTES, MAX_PACKAGE_BYTES, sha256, fail } from './catalog-contract.mjs';

export async function download(pathname, expected, max, fetcher=fetch) {
  const response=await fetcher(SITE+pathname,{redirect:'manual',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(response.status!==200||response.redirected)fail('CATALOG_HTTPS_STATUS');
  if(!/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type')||''))fail('CATALOG_HTTPS_CONTENT_TYPE');
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/u.test(declared)||Number(declared)>max))fail('CATALOG_HTTPS_SIZE_LIMIT');
  const chunks=[];let bytes=0;
  for await(const chunk of response.body){bytes+=chunk.length;if(bytes>max)fail('CATALOG_HTTPS_SIZE_LIMIT');chunks.push(Buffer.from(chunk));}
  const raw=Buffer.concat(chunks),hash=sha256(raw);
  if(!raw.length||hash!==expected.sha256||(expected.bytes!==undefined&&bytes!==expected.bytes))fail('CATALOG_HTTPS_HASH_MISMATCH');
  return {raw,receipt:{schemaVersion:1,site:SITE,path:pathname,status:200,sha256:hash,bytes,verifiedAt:new Date().toISOString()}};
}

export async function ignoredOutput(output){
  if(!path.isAbsolute(output)||!output.split(/[\\/]/u).includes('.local'))fail('CATALOG_IGNORED_OUTPUT_REQUIRED');
  let current=path.parse(output).root;
  for(const part of output.slice(current.length).split(path.sep).filter(Boolean)){
    current=path.join(current,part);
    try{const info=await lstat(current);if(info.isSymbolicLink()||!info.isDirectory())fail('CATALOG_OUTPUT_PATH_INVALID');}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  let parent=path.dirname(output);
  while(true){try{await lstat(parent);break;}catch(error){if(error.code!=='ENOENT')throw error;parent=path.dirname(parent);}}
  try{execFileSync('git',['check-ignore','--quiet','--',output],{cwd:parent,stdio:'ignore'});}catch{fail('CATALOG_OUTPUT_NOT_IGNORED');}
}
export async function readback({dropRoot,stageHash,output,fetcher=fetch}){
  const drop=await frozenDrop(dropRoot,stageHash);
  await ignoredOutput(output);
  const requests=[{path:INDEX_PATH,sha256:drop.stage.indexSHA256,bytes:drop.indexRaw.length,stem:'catalog',body:'catalog.plugins.json',max:MAX_INDEX_BYTES},...drop.stage.packages.map(record=>({...record,path:record.downloadPath,stem:`${record.id}-${record.version}`,body:`${record.id}-${record.version}.rivetin.json`,max:MAX_PACKAGE_BYTES}))];
  const results=[];
  // Do not write partial evidence until every canonical HTTPS response validates.
  for(const request of requests)results.push({request,...await download(request.path,request,request.max,fetcher)});
  await mkdir(output,{recursive:true});
  for(const {request,raw,receipt} of results){
    for(const [name,bytes] of [[request.body,raw],[`${request.stem}.receipt.json`,Buffer.from(JSON.stringify(receipt,null,2)+'\n')]]){
      const target=await safePath(output,name,{missing:true});
      await writeFile(target,bytes,{flag:'wx'});
    }
  }
  return results.map(({receipt})=>receipt);
}
async function main(args){
  const options={};
  for(let i=0;i<args.length;i++){const key=args[i];if(!['--drop','--stage-sha256','--output'].includes(key)||options[key]||!args[i+1]||args[i+1].startsWith('--'))fail('CATALOG_ARGUMENT_INVALID');options[key]=args[++i];}
  if(Object.keys(options).length!==3)fail('CATALOG_ARGUMENT_INVALID');
  console.log(JSON.stringify(await readback({dropRoot:options['--drop'],stageHash:options['--stage-sha256'],output:options['--output']}),null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(/^[A-Z][A-Z0-9_]+$/u.test(error.message)?error.message:'CATALOG_READBACK_FAILED');process.exitCode=1;});
