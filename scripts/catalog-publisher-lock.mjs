import {open,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fail} from './catalog-contract.mjs';
export const CATALOG_LOCK='catalog-import.lock',CATALOG_OWNER='catalog-v4-owner.lock';
export async function acquireOwner(local){
 const owner=await open(path.join(local,CATALOG_OWNER),'wx',0o600).catch(e=>{if(e.code==='EEXIST')fail('CATALOG_OWNER_LOCKED');throw e;});
 try{await owner.writeFile(JSON.stringify({schemaVersion:1,id:randomUUID(),pid:process.pid},null,2)+'\n');await owner.sync();return owner;}catch(e){await owner.close();throw e;}
}
export async function releaseOwner(local,owner){await owner.close();await unlink(path.join(local,CATALOG_OWNER));}
