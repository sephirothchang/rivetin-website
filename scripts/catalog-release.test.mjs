import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sha256 } from './catalog-contract.mjs';
import { reserveRelease,releaseLedger,emptyReleaseLedger,validateRelease,validateReleaseRequest,publicationParts,snapshotIndex,encode,shanghaiDate } from './catalog-release-contract.mjs';

const index=Buffer.from('{"schemaVersion":4,"plugins":[]}\n');
const at='2026-10-28T16:00:00.000Z';
function commit(plan){const ledger=structuredClone(plan.ledger);ledger.currentPublicationId=plan.record.publicationId;ledger.releases.find(r=>r.publicationId===plan.record.publicationId).status='local-committed';return releaseLedger(ledger);}

test('first ID uses publisher Shanghai issuance day, schema4 stays numeric and binds exact raw bytes',()=>{
 const p=reserveRelease(emptyReleaseLedger(),index,at);assert.equal(p.record.publicationId,'ML-V4-261029.0');assert.equal(p.metadata.catalogSchemaVersion,4);assert.equal(p.metadata.catalogSHA256,sha256(index));assert.equal(p.metadata.catalogBytes,index.length);assert.deepEqual(validateRelease(p.metadata,index),p.metadata);assert.equal(p.record.status,'reserved');assert.equal(p.ledger.currentPublicationId,null);
});
test('unchanged exact index reuses its current ID across midnight without rewriting frozen issuance time',()=>{
 const first=reserveRelease(emptyReleaseLedger(),index,at),previous=commit(first),p=reserveRelease(previous,index,'2026-10-29T16:00:00.000Z');assert.equal(p.reused,true);assert.equal(p.record.publicationId,first.record.publicationId);assert.equal(p.metadata.publishedAt,at);assert.deepEqual(p.ledger,previous);
});
test('revisions are decimal, failed reservations are never reused, and a new day starts at zero',()=>{
 let ledger=emptyReleaseLedger();for(let i=0;i<12;i++){const p=reserveRelease(ledger,Buffer.concat([index,Buffer.from(' '.repeat(i))]),at);assert.equal(p.record.publicationId,`ML-V4-261029.${i}`);ledger=p.ledger;ledger.releases.at(-1).status='abandoned';}
 assert.equal(reserveRelease(ledger,index,'2026-10-29T16:00:00.000Z').record.publicationId,'ML-V4-261030.0');
});
test('unknown reservation blocks allocation and changing back to a previously committed hash needs explicit rollback',()=>{
 const first=reserveRelease(emptyReleaseLedger(),index,at);assert.throws(()=>reserveRelease(first.ledger,index,at),/OUTCOME_UNKNOWN/);
 const one=commit(first),two=commit(reserveRelease(one,Buffer.concat([index,Buffer.from(' ')]),at));assert.throws(()=>reserveRelease(two,index,at),/ROLLBACK_REQUIRED/);
});
test('sidecar rejects index byte changes, path substitution, invalid date, extra fields and fake schema upgrades',()=>{
 const p=reserveRelease(emptyReleaseLedger(),index,at);for(const change of [{snapshotPath:'/catalog/v4/releases/../plugins.json'},{publicationId:'ML-V4-261029.00'},{catalogSchemaVersion:5},{publishedAt:'2026-02-30T00:00:00.000Z'},{privateTransactionId:'EXAMPLE_NOT_PUBLIC'}])assert.throws(()=>validateRelease({...p.metadata,...change},index));
 assert.throws(()=>validateRelease(p.metadata,Buffer.concat([index,Buffer.from(' ')])),/INDEX_MISMATCH/);assert.throws(()=>validateRelease(p.metadata,Buffer.from('{"schemaVersion":3,"plugins":[]}')),/V4_REQUIRED/);
});
test('publication labels reject non-decimal forms and cannot carry arbitrary paths',()=>{
 for(const id of ['ML-V4-261029.01','ML-V4-261029.A','ML-V4-261029.-1','ML-V5-261029.0','../ML-V4-261029.0'])assert.throws(()=>publicationParts(id));
 assert.equal(snapshotIndex('ML-V4-261029.10'),'/catalog/v4/releases/ML-V4-261029.10/plugins.json');assert.equal(shanghaiDate('2024-02-29T15:59:59.000Z'),'240229');assert.equal(shanghaiDate('2024-02-29T16:00:00.000Z'),'240301');
});
test('ledger is minimal public state, rejects duplicate IDs/invalid head and does not claim online verification',()=>{
 const p=reserveRelease(emptyReleaseLedger(),index,at),ledger=commit(p);assert.equal(ledger.releases[0].verifiedAt,null);assert.doesNotMatch(encode(ledger).toString(),/requestId|transaction|actor|backup|pid/);
 for(const mutate of [v=>v.releases.push({...v.releases[0]}),v=>v.currentPublicationId='ML-V4-261029.99',v=>v.releases[0].privatePath='EXAMPLE_PRIVATE',v=>v.releases[0].catalogBytes=-1,v=>v.releases[0].status='deployed',v=>v.releases[0].verifiedAt=at]){const copy=structuredClone(ledger);mutate(copy);assert.throws(()=>releaseLedger(copy));}
});
test('separate stage request binds legacy stage and index bytes, exact optional baseline; check does not allocate IDs',()=>{
 const ledger=emptyReleaseLedger(),request={schemaVersion:1,requestId:randomUUID(),stageSHA256:'a'.repeat(64),catalogPath:'/catalog/v4/plugins.json',indexSHA256:sha256(index),indexBytes:index.length,baseReleaseSHA256:null,candidateOnly:true};
 assert.equal(validateReleaseRequest(request,{stageHash:'a'.repeat(64),indexHash:sha256(index),indexBytes:index.length}),request);assert.deepEqual(ledger,emptyReleaseLedger());
 for(const change of [{candidateOnly:false},{baseReleaseSHA256:'bad'},{publicationId:'ML-V4-261029.0'},{requestId:'../escape'}])assert.throws(()=>validateReleaseRequest({...request,...change}));
 assert.throws(()=>validateReleaseRequest(request,{indexHash:'b'.repeat(64)}),/MISMATCH/);
});
