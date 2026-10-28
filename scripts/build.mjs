import { mkdir, copyFile, writeFile, cp, unlink, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const production = process.argv.includes('--production');
process.env.RIVETIN_SITE_MODE = production ? 'production' : 'preview';
const { pages: englishPages } = await import('../src/site-v2.mjs');
const { localizedPages, browserTranslations } = await import('../src/localization.mjs');
const pages = localizedPages(englishPages);

const root = fileURLToPath(new URL('../', import.meta.url));
const digest = content => createHash('sha256').update(content).digest('hex').slice(0,12);
const languageJson=JSON.stringify(browserTranslations);
const assetVersions={
  'assets/site.js':digest(await readFile(path.join(root,'src','site-v2.js'))),
  'assets/styles.css':digest(await readFile(path.join(root,'src','styles-v2.css'))),
};
await mkdir(path.join(root, 'dist', 'assets'), { recursive: true });
for (const [name, html] of Object.entries(pages)) {
  await mkdir(path.dirname(path.join(root,'dist',name)),{recursive:true});
  let versioned=html;
  for (const [asset,version] of Object.entries(assetVersions)) versioned=versioned.replaceAll(`${asset}"`,`${asset}?v=${version}"`);
  versioned=versioned.replace('data-language-switch ',`data-language-switch data-translations="assets/zh-CN.json?v=${digest(languageJson)}" `);
  await writeFile(path.join(root, 'dist', name), versioned, 'utf8');
}
for (const [source, name] of [['styles-v2.css', 'styles.css'], ['site-v2.js', 'site.js'], ['mark.svg', 'mark.svg']]) {
  await copyFile(path.join(root, 'src', source), path.join(root, 'dist', 'assets', name));
}
await cp(path.join(root, 'src', 'fonts'), path.join(root, 'dist', 'assets', 'fonts'), { recursive: true });
await writeFile(path.join(root,'dist','assets','zh-CN.json'),languageJson);
await writeFile(path.join(root, 'dist', '.nojekyll'), '');
await writeFile(path.join(root, 'dist', 'robots.txt'), production ? 'User-agent: *\nAllow: /\nSitemap: https://rivetin.dev/sitemap.xml\n' : 'User-agent: *\nDisallow: /\n');
await writeFile(path.join(root, 'dist', 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['','guide.html'].map(page=>`<url><loc>https://rivetin.dev/${page}</loc></url>`).join('')}</urlset>\n`);
for (const page of ['index.html','guide.html','404.html']) {
  await unlink(path.join(root,'dist','zh',page)).catch(error=>{if(error.code!=='ENOENT')throw error;});
}
// Retire only the three known generated concept pages from the first iteration.
for (const name of ['industrial.html', 'editorial.html', 'orbital.html']) {
  await unlink(path.join(root, 'dist', name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
console.log(`Built ${Object.keys(pages).length} pages in dist/ (no dependencies).`);
