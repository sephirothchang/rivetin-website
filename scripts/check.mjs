import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const files = (await readdir(root,{recursive:true})).filter(file => file.endsWith('.html')).map(file=>file.replaceAll('\\','/'));
const documents = new Map(await Promise.all(files.map(async name => [name, await readFile(path.join(root, name), 'utf8')])));
const project = JSON.parse(await readFile(new URL('../src/project-state.json',import.meta.url),'utf8'));
const { extensionCopy } = await import('../src/extension-copy.mjs');
let checkedLinks = 0;
const production = process.argv.includes('--production');
for (const [name, html] of documents) {
  const chinese=name.startsWith('zh/');
  assert.ok(html.includes(`<html lang="${chinese?'zh-CN':'en'}"`), `${name}: document language`);
  if (!chinese) assert.doesNotMatch(html.replace(/<a[^>]*data-language-switch[^>]*>[\s\S]*?<\/a>/gu,''), /\p{Script=Han}/u, `${name}: English content`);
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
    assert.match(html, /Public installation packages are not available yet/u, `${name}: release status`);
    assert.match(html, /Not affiliated with or endorsed by SmartX/u, `${name}: project attribution`);
  }
}
const homepage = documents.get('index.html');
const guide = documents.get('guide.html');
assert.deepEqual([...documents.keys()].sort(),['404.html','guide.html','index.html','zh/404.html','zh/guide.html','zh/index.html']);
for (const page of ['index.html','guide.html','404.html']) {
  const en=documents.get(page),zh=documents.get(`zh/${page}`);
  assert.ok(en.includes(`data-language-switch href="zh/${page}"`),`${page}: Chinese switch route`);
  assert.ok(zh.includes(`data-language-switch href="../${page}"`),`${page}: English switch route`);
  assert.deepEqual([...en.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/gu)].map(m=>m[1]),[...zh.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/gu)].map(m=>m[1]),`${page}: translation must preserve commands and identifiers`);
  for (const locale of ['en','zh-CN']) assert.ok(zh.includes(`hreflang="${locale}"`),`${page}: alternate language discovery`);
}
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
assert.equal(project.catalogPublishedCount,0,'Reassess release availability before publishing catalog entries.');
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
assert.equal(project.liveRivetinAcceptance,'development-test-accepted');
assert.ok(guide.includes('CloudTower 4.9.0 development/test environment only'),'Current acceptance scope must remain explicit');
assert.ok(guide.includes('not a production or all-version guarantee'),'Acceptance must not imply general production support');
assert.doesNotMatch(guide,/live Rivetin installation acceptance: pending|has not completed live acceptance/iu,'Stale installation acceptance');
const fontCss = await readFile(path.join(root,'assets','fonts','fonts.css'),'utf8');
for (const match of fontCss.matchAll(/url\(([^)]+)\)/gu)) {
  assert.ok(!match[1].includes('/'), 'Fonts must be local files');
  assert.ok((await stat(path.join(root,'assets','fonts',match[1]))).isFile(), `Missing font ${match[1]}`);
}
for (const file of ['dm-sans-OFL.txt','dm-mono-OFL.txt']) {
  assert.match(await readFile(path.join(root,'assets','fonts',file),'utf8'),/SIL OPEN FONT LICENSE/u);
}
console.log(`PASS: ${files.length} pages; ${checkedLinks} local references; unique IDs, preview guards, catalog and content checks.`);
