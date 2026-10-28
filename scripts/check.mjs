import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { publicCatalogState } from './catalog-files.mjs';
import { catalogSummary, selectPluginReleases,catalogReleaseIdentity,catalogReadbackDate } from '../src/catalog-releases.mjs';

const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const files = (await readdir(root,{recursive:true})).filter(file => file.endsWith('.html')).map(file=>file.replaceAll('\\','/'));
const documents = new Map(await Promise.all(files.map(async name => [name, await readFile(path.join(root, name), 'utf8')])));
const project = JSON.parse(await readFile(new URL('../src/project-state.json',import.meta.url),'utf8'));
const { extensionCopy } = await import('../src/extension-copy.mjs');
let checkedLinks = 0;
const production = process.argv.includes('--production');
const catalogState=await publicCatalogState(path.dirname(root));
for(const record of catalogState.packages)assert.deepEqual(await readFile(path.join(root,record.path.slice(1))),await readFile(path.join(catalogState.publicRoot,record.path.slice(1))),'Deployed package bytes must equal reviewed source bytes');
if(catalogState.catalog)assert.deepEqual(await readFile(path.join(root,'catalog/plugins.json')),catalogState.indexRaw,'Deployed index bytes must equal reviewed source bytes');
if(catalogState.v4Raw)assert.deepEqual(await readFile(path.join(root,'catalog/v4/plugins.json')),catalogState.v4Raw,'Deployed v4 index bytes must equal reviewed source bytes');
for(const name of catalogState.releaseFiles||[])assert.deepEqual(await readFile(path.join(root,name)),await readFile(path.join(catalogState.publicRoot,name)),'Release metadata/snapshot bytes must equal the source ledger binding');
for (const [name, html] of documents) {
  const chinese=name.startsWith('zh/');
  assert.ok(html.includes(`<html lang="${chinese?'zh-CN':'en'}"`), `${name}: document language`);
  if (!chinese) assert.doesNotMatch(html.replace(/<button[^>]*data-language-switch[^>]*>[\s\S]*?<\/button>/gu,''), /\p{Script=Han}/u, `${name}: English content`);
  else assert.match(html,/\p{Script=Han}/u,`${name}: Chinese content`);
  assert.doesNotMatch(html, /https:\/\/github\.com\/sephirothchang\/smartx-extensions/u, `${name}: stale repository URL`);
  assert.match(html, /<meta name="viewport"/u, `${name}: responsive viewport`);
  assert.match(html, new RegExp(`<meta name="robots" content="${production && !name.endsWith('404.html') ? 'index,follow' : 'noindex,nofollow'}"`,'u'), `${name}: indexing mode`);
  assert.equal((html.match(/<h1(?:\s|>)/gu) || []).length, 1, `${name}: one primary heading`);
  const ids = [...html.matchAll(/\sid="([^"]+)"/gu)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${name}: duplicate IDs`);
  for (const match of html.matchAll(/\s(?:href|src)="([^"]+)"/gu)) {
    const value = match[1];
    if (/^https:\/\//u.test(value)) {
      assert.ok(['github.com','rivetin.dev'].includes(new URL(value).hostname), `${name}: unexpected external dependency/link`);
      continue;
    }
    const url = new URL(value, `https://preview.invalid/${name}`);
    const pathname = decodeURIComponent(url.pathname.slice(1));
    const filename = !pathname || pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const target = path.resolve(root, filename);
    assert.ok(target.startsWith(root + path.sep), `${name}: out-of-root path`);
    assert.ok((await stat(target)).isFile(), `${name}: missing ${filename}`);
    if (url.hash) {
      const targetHtml = documents.get(filename);
      assert.ok(targetHtml?.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `${name}: missing anchor ${value}`);
    }
    checkedLinks += 1;
  }
  assert.doesNotMatch(html, /(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.|D:\\|C:\\Users|api[_-]?key|Bearer\s+\S+|curl\s+https?)/iu, `${name}: private data or unverified install command`);
  if (name === 'index.html') {
    assert.equal((html.match(/class="extension-row"/gu) || []).length, 6, `${name}: extension catalog`);
    assert.equal((html.match(/<dialog /gu) || []).length, 6, `${name}: extension details`);
    assert.match(html, /Framework installers remain unavailable/u, `${name}: framework release status`);
    assert.match(html, /Not affiliated with or endorsed by SmartX/u, `${name}: project attribution`);
  }
}
const homepage = documents.get('index.html');
const guide = documents.get('guide.html');
const releaseIdentity=catalogReleaseIdentity(catalogState);
if(releaseIdentity.status==='registered')assert.ok(homepage.includes(`<code data-catalog-release-id>${releaseIdentity.publicationId}</code>`),'Catalog ID must come from validated metadata/ledger');
else assert.ok(homepage.includes('Catalog release ID: not registered.'),'Missing identity must not be fabricated from schema or plugin versions');
const readbackDate=catalogReadbackDate(releaseIdentity);
if(readbackDate)assert.ok(homepage.includes(`Publication readback recorded (UTC+08:00): <code>${readbackDate}</code>.`),'Verified readback uses the Shanghai date with an explicit timezone');
else if(releaseIdentity.status==='registered')assert.ok(homepage.includes('Publication readback is pending.'),'Pending release must not gain a readback date');
assert.deepEqual([...documents.keys()].sort(),['404.html','guide.html','index.html']);
for (const [page,html] of documents) {
  assert.ok(html.includes('type="button" class="language-link" data-language-switch'),page+': in-page language control');
  assert.ok(!/href="(?:\.\.\/)?zh\//u.test(html),page+': language switching must not navigate to a separate route');
}
const languageData=JSON.parse(await readFile(path.join(root,'assets','zh-CN.json'),'utf8'));
assert.equal(languageData.messages['Host access'],'主机访问');
assert.equal(languageData.messages['Security policy'],'安全策略');
assert.equal(languageData.richMessages['The CLI is {0}, the API prefix is {1}, plugin IDs begin with {2}, and plugin archives end in {3}. Legacy PluginKit IDs, paths, environment variables and package formats have no compatibility aliases. The CLI does not automatically import or migrate old deployments.'].match(/\{\d+\}/gu).length,4);
for (const copy of extensionCopy) {
  const row=homepage.match(new RegExp(`<article class="extension-row" id="extension-${copy.key}"[\\s\\S]*?</article>`,'u'))?.[0];
  assert.ok(row?.includes(`class="badge enhancement-badge">${copy.enhancement}</span>`),`${copy.id}: functional area badge`);
  assert.ok(!row.includes(copy.status),`${copy.id}: development status belongs in details`);
}
assert.equal(await readFile(path.join(root,'robots.txt'),'utf8'), production ? 'User-agent: *\nAllow: /\nSitemap: https://rivetin.dev/sitemap.xml\n' : 'User-agent: *\nDisallow: /\n');
if (production) {
  assert.ok(homepage.includes('<link rel="canonical" href="https://rivetin.dev/">'));
  assert.ok(guide.includes('<link rel="canonical" href="https://rivetin.dev/guide.html">'));
  assert.ok(documents.get('404.html').includes('<base href="/">'),'Nested missing routes must resolve error-page assets from the site root');
}
const summary=catalogSummary(catalogState);
for(const html of [homepage,guide]) {
  assert.ok(html.includes(`<code data-catalog-v4-count>${summary.v4}</code>`),'v4 count must come from the validated catalog');
  assert.ok(html.includes(`<code data-catalog-v3-count>${summary.v3}</code>`),'v3 count must remain separate');
}
for(const extension of project.extensions) {
  const copy=extensionCopy.find(item=>item.id===extension.id);
  const dialog=homepage.match(new RegExp(`<dialog[^>]*id="detail-${copy.key}"[\\s\\S]*?</dialog>`,'u'))?.[0];
  assert.ok(dialog);
  const selected=selectPluginReleases(extension.id,catalogState,project.frameworkVersion);
  assert.equal(dialog.includes('data-current-download'),Boolean(selected.release),extension.id+': primary download must be eligible v4');
  if(selected.release)assert.ok(dialog.includes(`href="${selected.release.downloadPath}"`));
  assert.equal(dialog.includes('data-legacy-download'),Boolean(selected.legacyRelease));
  if(selected.legacyRelease)assert.ok(dialog.includes(`href="${selected.legacyRelease.downloadPath}"`));
}
for(const extension of project.extensions) {
  assert.ok(homepage.includes(extension.id),`${extension.id}: missing detail identity`);
  assert.ok(homepage.includes(`v${extension.version} · Source`),`${extension.id}: stale homepage source version`);
  assert.ok(guide.includes(`<code>${extension.version}</code>`),`${extension.id}: stale guide source version`);
}
for(const id of ['release-status','compatibility','installation','extension-workflow','ssh-channel','recovery','development']) {
  assert.ok(guide.includes(`id="${id}"`),`Missing guide section ${id}`);
}
assert.ok(guide.includes('data-cli-executable=".\\rivetin-windows-amd64.exe"'),'Missing Windows executable example');
assert.ok(guide.includes('data-cli-executable="./rivetin-darwin-arm64"'),'Missing macOS executable example');
assert.ok(guide.includes('data-cli-executable="./rivetin-linux-amd64"'),'Missing Linux executable example');
assert.ok(guide.includes('--ssh-hostkey SHA256:&lt;VERIFIED_HOST_KEY&gt;'),'Missing explicit host trust in command examples');
assert.equal(project.schemaVersion,2);
assert.equal(project.candidateRelease.currentDeployment,'unverified');
assert.equal(project.candidateRelease.status,'not-admitted');
assert.equal(project.historicalAcceptance.reference,'docs/0.2-validation.md');
assert.ok(guide.includes(`Historical ${project.historicalAcceptance.frameworkVersion} validation scope`));
assert.ok(guide.includes('href="/catalog/v4/plugins.json"'));
assert.ok(guide.includes('href="/catalog/plugins.json"'));
assert.doesNotMatch(guide,/Rivetin 0\.1\.4 has completed/u);
assert.doesNotMatch(homepage,/Dev\/test enabled|Live UI · no samples/u);
assert.ok(guide.includes('CloudTower 4.9.0 development/test environment only'),'Current acceptance scope must remain explicit');
assert.ok(guide.includes('not a production or all-version guarantee'),'Acceptance must not imply general production support');
assert.doesNotMatch(guide,/live Rivetin installation acceptance: pending|has not completed live acceptance/iu,'Stale installation acceptance');
const fontCss = await readFile(path.join(root,'assets','fonts','fonts.css'),'utf8');
for (const match of fontCss.matchAll(/url\(([^)]+)\)/gu)) {
  assert.ok(!match[1].includes('/'), 'Fonts must be local files');
  assert.ok((await stat(path.join(root,'assets','fonts',match[1]))).isFile(), `Missing font ${match[1]}`);
}
for (const file of ['dm-sans-OFL.txt','dm-mono-OFL.txt','noto-sans-sc-OFL.txt']) {
  assert.match(await readFile(path.join(root,'assets','fonts',file),'utf8'),/SIL OPEN FONT LICENSE/u);
}
const chineseGlyphs=await readFile(path.join(root,'assets/fonts/noto-sans-sc-characters.txt'),'utf8');
for (const source of ['src/zh-CN.mjs','src/site-v2.js']) {
  const text=await readFile(new URL(`../${source}`,import.meta.url),'utf8');
  for (const character of text.match(/[\p{Script=Han}\u3000-\u303f\uff00-\uffef]/gu)||[]) assert.ok(chineseGlyphs.includes(character),`Update Chinese font subset for ${character} with scripts/subset-chinese-font.ps1`);
}
assert.equal((await readFile(path.join(root,'assets/fonts/noto-sans-sc-subset.woff2'))).subarray(0,4).toString(),'wOF2');
console.log(`PASS: ${files.length} pages; ${checkedLinks} local references; unique IDs, preview guards, catalog and content checks.`);
