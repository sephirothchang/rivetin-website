import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safePath } from './catalog-files.mjs';
import { MAX_INDEX_BYTES, MAX_PACKAGE_BYTES, fail } from './catalog-contract.mjs';
import { V4_INDEX_PATH } from './catalog-v4-contract.mjs';
import { frozenV4Drop } from './catalog-v4-staging.mjs';
import { download, ignoredOutput } from './readback-catalog.mjs';

export async function readbackV4({dropRoot,stageHash,baseHash,output,fetcher=fetch}){
  const drop=await frozenV4Drop(dropRoot,stageHash,baseHash);
  await ignoredOutput(output);
  const requests=[{path:V4_INDEX_PATH,sha256:drop.stage.indexSHA256,bytes:drop.indexRaw.length,stem:'catalog',body:'catalog.plugins.json',max:MAX_INDEX_BYTES},...drop.stage.packages.map(record=>({...record,path:record.downloadPath,stem:`${record.id}-${record.version}`,body:`${record.id}-${record.version}.rivetin.json`,max:MAX_PACKAGE_BYTES}))];
  const results=[];
  for(const request of requests)results.push({request,...await download(request.path,request,request.max,fetcher)});
  await mkdir(output,{recursive:true});
  for(const {request,raw,receipt} of results){
    for(const [name,bytes] of [[request.body,raw],[`${request.stem}.receipt.json`,Buffer.from(JSON.stringify(receipt,null,2)+'\n')]]){
      const target=await safePath(output,name,{missing:true});await writeFile(target,bytes,{flag:'wx'});
    }
  }
  return results.map(({receipt})=>receipt);
}
async function main(args){
  const values={};for(let i=0;i<args.length;i++){const key=args[i];if(!['--drop','--stage-sha256','--base-sha256','--output'].includes(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))fail('CATALOG_ARGUMENT_INVALID');values[key]=args[++i];}
  if(Object.keys(values).length!==4)fail('CATALOG_ARGUMENT_INVALID');
  console.log(JSON.stringify(await readbackV4({dropRoot:values['--drop'],stageHash:values['--stage-sha256'],baseHash:values['--base-sha256'],output:values['--output']}),null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(/^[A-Z][A-Z0-9_]+$/u.test(error.message)?error.message:'CATALOG_V4_READBACK_FAILED');process.exitCode=1;});
