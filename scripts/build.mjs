import { mkdir, copyFile, writeFile, cp, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const production = process.argv.includes('--production');
process.env.RIVETIN_SITE_MODE = production ? 'production' : 'preview';
const { pages } = await import('../src/site-v2.mjs');

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(path.join(root, 'dist', 'assets'), { recursive: true });
for (const [name, html] of Object.entries(pages)) {
  await writeFile(path.join(root, 'dist', name), html, 'utf8');
}
for (const [source, name] of [['styles-v2.css', 'styles.css'], ['site-v2.js', 'site.js'], ['mark.svg', 'mark.svg']]) {
  await copyFile(path.join(root, 'src', source), path.join(root, 'dist', 'assets', name));
}
await cp(path.join(root, 'src', 'fonts'), path.join(root, 'dist', 'assets', 'fonts'), { recursive: true });
await writeFile(path.join(root, 'dist', '.nojekyll'), '');
await writeFile(path.join(root, 'dist', 'robots.txt'), production ? 'User-agent: *\nAllow: /\nSitemap: https://rivetin.dev/sitemap.xml\n' : 'User-agent: *\nDisallow: /\n');
await writeFile(path.join(root, 'dist', 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://rivetin.dev/</loc></url><url><loc>https://rivetin.dev/guide.html</loc></url></urlset>\n`);
// Retire only the three known generated concept pages from the first iteration.
for (const name of ['industrial.html', 'editorial.html', 'orbital.html']) {
  await unlink(path.join(root, 'dist', name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
console.log(`Built ${Object.keys(pages).length} pages in dist/ (no dependencies).`);
