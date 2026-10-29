import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectSnapshot,withReviewedHistoricalFingerprint } from './project-snapshot.mjs';

const history = { frameworkVersion: '0.2.0', reviewedOn: '2026-10-28', reference: 'docs/0.2-validation.md', documentSHA256: 'a'.repeat(64), scope: 'Historical controlled development/test acceptance only.' };
const input = { reviewedOn: '2026-10-28', frameworkVersion: '0.2.1', extensions: [{ id: 'rivetin-example', version: '0.3.0', catalogReleases: { v4: null, v3: null } }], catalogPublication: { v3: 3, v4: 1, uniqueExtensions: 3 }, installerProfiles: [] };
test('a changed validation document requires exact reviewed bytes and preserves the historical version, date and scope',()=>{
 const previous={historicalAcceptance:history},newHash='b'.repeat(64);assert.throws(()=>withReviewedHistoricalFingerprint(previous,newHash));assert.throws(()=>withReviewedHistoricalFingerprint(previous,newHash,'c'.repeat(64)));
 const reviewed=withReviewedHistoricalFingerprint(previous,newHash,newHash);assert.deepEqual(reviewed.previous.historicalAcceptance,{...history,documentSHA256:newHash});assert.equal(previous.historicalAcceptance.documentSHA256,history.documentSHA256);assert.equal(reviewed.changed,true);
});

test('source version changes preserve historical acceptance without promoting the current candidate', () => {
  const previous = { historicalAcceptance: history };
  const snapshot = createProjectSnapshot({ ...input, previous });
  assert.equal(snapshot.frameworkVersion, '0.2.1');
  assert.deepEqual(snapshot.historicalAcceptance, history);
  assert.deepEqual(snapshot.candidateRelease, { status: 'not-admitted', currentDeployment: 'unverified' });
  assert.equal(snapshot.publicInstallerAvailable, false);
  snapshot.historicalAcceptance.frameworkVersion = '9.9.9';
  assert.equal(previous.historicalAcceptance.frameworkVersion, '0.2.0');
});

test('legacy live flags and source versions cannot manufacture a historical acceptance record', () => {
  const snapshot = createProjectSnapshot({ ...input, previous: { liveFrameworkVersion: '0.1.4', liveRivetinAcceptance: 'development-test-accepted' } });
  assert.equal(snapshot.historicalAcceptance, null);
  assert.equal(Object.hasOwn(snapshot, 'liveFrameworkVersion'), false);
  assert.equal(Object.hasOwn(snapshot, 'liveRivetinAcceptance'), false);
  assert.deepEqual(snapshot.extensions[0].catalogReleases, { v4: null, v3: null });
});

test('historical acceptance must carry a reviewed document fingerprint', () => {
  assert.throws(() => createProjectSnapshot({ ...input, previous: { historicalAcceptance: { ...history, documentSHA256: '' } } }));
});

test('published framework source is an explicit independent record, never inferred from the working version', () => {
  assert.equal(createProjectSnapshot({...input,previous:{}}).frameworkSourcePublication,null);
  const publication={version:'0.2.2',commit:'f'.repeat(40),verifiedOn:'2026-10-29'};
  const snapshot=createProjectSnapshot({...input,frameworkVersion:'0.2.3',previous:{frameworkSourcePublication:publication}});
  assert.deepEqual(snapshot.frameworkSourcePublication,publication);
  assert.equal(snapshot.frameworkVersion,'0.2.3');
  assert.throws(()=>createProjectSnapshot({...input,previous:{frameworkSourcePublication:{...publication,commit:'main'}}}));
  assert.throws(()=>createProjectSnapshot({...input,previous:{frameworkSourcePublication:{...publication,token:'private'}}}));
});

test('reviewed source, current deployment and historical acceptance stay independent', async () => {
  const { readFile } = await import('node:fs/promises');
  const project = JSON.parse(await readFile(new URL('../src/project-state.json', import.meta.url), 'utf8'));
  const { pages } = await import('../src/site-v2.mjs');
  assert.equal(project.frameworkVersion, '0.2.4');
  assert.equal(project.frameworkSourcePublication.commit,'c86aec1487d15356f54a3d64291d9afdf6f741c2');
  assert.ok(pages['guide.html'].includes('/commit/f31821babc20cb20d8e1cbc3508a820a93666e5e'));
  assert.ok(pages['guide.html'].includes('/commit/'+project.frameworkSourcePublication.commit));
  assert.equal(project.candidateRelease.currentDeployment, 'unverified');
  assert.equal(project.historicalAcceptance.documentSHA256, 'fd171625d70befa4408e0c9d7dae75e80237c9b112f9df6ebacb73fb802fb3d8');
  assert.match(pages['guide.html'], /Reviewed deployment · 2026-10-29<\/th><td><code>0\.2\.4<\/code> · Enabled/u);
  assert.ok(pages['guide.html'].includes('Fixed build deployed; framework source synchronized'));
  assert.ok(pages['guide.html'].includes('0.2.4 framework source is synchronized at the exact commit listed above'));
  assert.doesNotMatch(pages['guide.html'], /FW-R1|final-r2/u);
});

test('context repair scope keeps actual failure history and downloads follow the exact catalog', async () => {
  const { pages, extensions } = await import('../src/site-v2.mjs');
  const { messages } = await import('../src/zh-CN.mjs');
  const context = extensions.find(item => item.key === 'context');
  assert.equal(context.version, '0.5.9');
  assert.match(context.detail, /0\.5\.7.*actual route-revisit CPU-editor failure/u);
  assert.match(messages[context.detail], /0\.5\.7.*实际失败/u);
  const {readFile}=await import('node:fs/promises');
  const catalog=JSON.parse(await readFile(new URL('../public/catalog/v4/plugins.json',import.meta.url),'utf8'));
  const admitted=catalog.plugins.find(item=>item.id===context.id&&item.status==='published');
  assert.equal(context.currentRelease?.version??null,admitted?.version??null);
  assert.equal(context.release?.version??null,admitted?.version??null);
  if(admitted)assert.equal(context.release.sha256,admitted.sha256);
  for (const key of ['topology', 'converter']) assert.equal(extensions.find(item => item.key === key).release, null);
  assert.match(pages['index.html'], /v0\.5\.9 · Source/u);
  const current = extensions.find(item => item.key === 'ipmi');
  assert.equal(current.release.version, '0.1.4');
  assert.equal(current.legacyRelease.version, '0.1.2');
});

test('023 built-in identity guidance preserves explicit ROOT approval, uncertain outcome and collection boundaries', async()=>{
 const {pages}=await import('../src/site-v2.mjs');const {localizedPages}=await import('../src/localization.mjs');const guide=pages['guide.html'];
 assert.match(guide,/Tower <code>ROOT<\/code>/u);assert.match(guide,/\/usr\/bin\/uname -srm/u);assert.match(guide,/approves it once, then separately chooses Execute/u);assert.match(guide,/Approval alone does not run the command or grant SMART collection rights/u);assert.match(guide,/query the original request; do not automatically execute again/u);assert.match(guide,/real SMART samples (?:or|and) cross-day collection/u);assert.match(guide,/other five targets have no native execution evidence/u);assert.ok(localizedPages(pages)['guide.html']);
});

test('024 current read-only UI scope never becomes authentication, identity or all-API acceptance',async()=>{
 const {pages}=await import('../src/site-v2.mjs');const guide=pages['guide.html'];assert.match(guide,/Controlled Chinese interface checks at 1280 by 720/u);assert.match(guide,/four compatible installed market entries/u);assert.match(guide,/No authentication or built-in identity command was executed in that interface pass/u);assert.match(guide,/SSH and resource API monitoring, real SMART health samples and cross-day collection remain unverified/u);assert.match(guide,/0.2.4 framework source is synchronized at the exact commit listed above/u);assert.doesNotMatch(guide,/[A-Z]:[\\/]|\.local[\\/]|\.private\.json|scopeId|hostId=/u);
});

test('minimum-only documentation keeps confirmed024 runtime separate from simulated above-max acceptance',async()=>{const {pages}=await import('../src/site-v2.mjs');const {localizedPages}=await import('../src/localization.mjs');const guide=pages['guide.html'];assert.match(guide,/minimum inclusively/u);assert.doesNotMatch(pages['index.html']+guide,/(?:&lt;|<)0\.3\.0/u);assert.match(guide,/minimum of 0.2.4 or later/u);assert.match(guide,/reject an entire V4 catalog/u);assert.match(guide,/0\.2\.4<\/code> · Enabled/u);assert.doesNotMatch(guide,/0\.3\.0<\/code> · Enabled/u);assert.match(guide,/observed runtime was 0.2.4/u);assert.match(guide,/above the former maximum was tested only in a local simulated context/u);assert.ok(localizedPages(pages)['guide.html']);});

test('separate real identity result is limited to one built-in execution and planned tools have no release',async()=>{const {pages,extensions}=await import('../src/site-v2.mjs');const {localizedPages}=await import('../src/localization.mjs');const guide=pages['guide.html'];assert.match(guide,/One controlled saved host completed one review, one explicit approval and one execution/u);assert.match(guide,/querying the original result matched its persisted receipt/u);assert.match(guide,/not SMART consumer execution, general command registration or every host/u);assert.match(guide,/Migration, valid SMART health samples, cross-day collection and real revocation or I\/O fault handling remain unverified/u);assert.doesNotMatch(guide,/[A-Z]:[\\/]|\.local[\\/]|\.private\.json|scopeId|hostId=/u);for(const key of ['topology','converter'])assert.equal(extensions.find(e=>e.key===key).release,null);assert.ok(localizedPages(pages)['guide.html']);});
