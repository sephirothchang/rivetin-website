import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importCatalog } from './catalog-files.mjs';

const usage='node scripts/import-catalog.mjs --drop <absolute-directory> --stage-sha256 <frozen-stage-json-sha256> [--check]';
export async function run(args,{siteRoot=fileURLToPath(new URL('../',import.meta.url))}={}){
  if(args.length===1&&args[0]==='--help'){process.stdout.write(usage+'\nDestination: public/; local integrity ledger: catalog-integrity.json. Does not commit, push or deploy.\n');return;}
  const values={},allowed=new Set(['--drop','--stage-sha256']);let check=false;
  for(let i=0;i<args.length;i++){const key=args[i];if(key==='--check'&&!check){check=true;continue;}if(!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw new Error('CATALOG_ARGUMENT_INVALID');values[key]=args[++i];}
  if(!values['--drop']||!path.isAbsolute(values['--drop'])||!values['--stage-sha256'])throw new Error('CATALOG_ARGUMENT_INVALID');
  const result=await importCatalog({siteRoot,dropRoot:values['--drop'],stageHash:values['--stage-sha256'],check});process.stdout.write(JSON.stringify(result)+'\n');return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run(process.argv.slice(2)).catch(error=>{process.stderr.write(/^[A-Z][A-Z0-9_]+$/u.test(error.message)?error.message+'\n':'CATALOG_IMPORT_FAILED\n');process.exitCode=1;});
