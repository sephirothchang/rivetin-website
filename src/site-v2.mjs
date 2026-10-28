import { readFileSync } from 'node:fs';
import { attachProjectState } from './extension-copy.mjs';
import { catalogSummary, selectPluginReleases, catalogReleaseIdentity } from './catalog-releases.mjs';
import { documentation } from './documentation.mjs';
import { publicCatalogState } from '../scripts/catalog-files.mjs';
import { fileURLToPath } from 'node:url';

const project = JSON.parse(readFileSync(new URL('./project-state.json', import.meta.url), 'utf8'));
const catalogState=await publicCatalogState(fileURLToPath(new URL('../',import.meta.url)));
project.catalogPublication=catalogSummary(catalogState);
const releaseIdentity=catalogReleaseIdentity(catalogState);
function catalogReleaseNote(){
  if(releaseIdentity.status==='unregistered')return '<p>Catalog release ID: not registered. The first ID is assigned by a publication transaction.</p>';
  if(releaseIdentity.status==='unverified')return '<p>Catalog release ID could not be verified. Package availability is recorded separately.</p>';
  const confirmation=releaseIdentity.publicationState==='verified'?`Publication readback recorded: <code>${releaseIdentity.verifiedAt.slice(0,10)}</code>.`:'Publication readback is pending.';
  return `<p>Catalog release: <code data-catalog-release-id>${releaseIdentity.publicationId}</code>. This identifies the catalog snapshot; plugin versions and verification scopes are recorded separately.</p><p>${confirmation}</p>`;
}
const repository = project.repository;
const paths = {
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  external: '<path d="M7 17 17 7M7 7h10v10"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  link: '<path d="m9 15 6-6m-8 4-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 7 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(2 1) scale(.9)"/>',
  menu: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h7M7 17h10"/>',
  terminal: '<path d="m5 6 6 6-6 6m8 0h6"/>',
  disk: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m16 16 2 2"/>',
  network: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 8v5M5 17v-4h14v4"/>',
  policy: '<path d="m12 2 8 4v5c0 5-8 11-8 11S4 16 4 11V6z"/><path d="M8 10h8m-8 4h5"/>',
  github: '<path d="M9 20c-5 1-5-3-7-3m14 6v-4a4 4 0 0 0-1-3c3 0 6-1 6-6a5 5 0 0 0-1-4 5 5 0 0 0 0-4s-2-1-4 1a14 14 0 0 0-8 0C6 1 4 2 4 2a5 5 0 0 0 0 4 5 5 0 0 0-1 4c0 5 3 6 6 6a4 4 0 0 0-1 3v4" transform="translate(0 -1)"/>',
};
const icon = (name, css = '') => `<svg class="icon ${css}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
const mark = '<svg class="brand-mark" viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M7 29V7h12c7 0 10 4 10 8s-3 8-10 8H7m12 0 10 6" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><circle cx="7" cy="7" r="2.5" fill="currentColor"/><circle cx="7" cy="29" r="2.5" fill="currentColor"/></svg>';
const brand = `<span class="brand">${mark}<span>Rivetin</span></span>`;

export const extensions = attachProjectState(project).map(extension=>({...extension,...selectPluginReleases(extension.id,catalogState,project.frameworkVersion)}));

function head(title, description, page = 'index.html') {
  const production = process.env.RIVETIN_SITE_MODE === 'production';
  const robots = production && page !== '404.html' ? 'index,follow' : 'noindex,nofollow';
  const canonical = production && page !== '404.html' ? `<link rel="canonical" href="https://rivetin.dev/${page === 'index.html' ? '' : page}">` : '';
  const base = production && page === '404.html' ? '<base href="/">' : '';
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="description" content="${description}"><meta name="robots" content="${robots}">${base}${canonical}<title>${title}</title><link rel="icon" href="assets/mark.svg" type="image/svg+xml"><link rel="stylesheet" href="assets/fonts/fonts.css"><link rel="stylesheet" href="assets/styles.css"><script src="assets/site.js" defer></script></head>`;
}

function header(onDocs = false) {
  const anchor = onDocs ? 'index.html' : '';
  return `<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="header-inner container"><a class="brand-link" href="index.html" aria-label="Rivetin home">${brand}</a><nav class="main-nav" aria-label="Main navigation"><div class="nav-dropdown"><button class="nav-trigger" aria-expanded="false" aria-controls="extensions-menu">Extensions ${icon('chevron')}</button><div class="nav-popover" id="extensions-menu" hidden><span class="popover-label">The extension library</span>${extensions.map(e=>`<a href="${anchor}#extension-${e.key}">${icon(e.icon)}<span>${e.name}</span></a>`).join('')}<a class="popover-all" href="${anchor}#extensions">Explore all extensions ${icon('arrow')}</a></div></div><a href="${anchor}#platform">Platform</a><a href="guide.html" ${onDocs?'aria-current="page"':''}>Docs</a><a class="github-nav" href="${repository}" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository (access currently required)">${icon('github')}</a></nav><button class="mobile-toggle" aria-expanded="false" aria-controls="mobile-menu" aria-label="Open navigation"><span></span><span></span></button><nav class="mobile-menu" id="mobile-menu" aria-label="Mobile navigation" hidden><a href="${anchor}#extensions">Extensions</a><a href="${anchor}#platform">Platform</a><a href="guide.html">Documentation</a><a href="${repository}" target="_blank" rel="noopener noreferrer">GitHub ${icon('external')}</a></nav></div></header>`;
}

function drawing(type) {
  const defs = '<defs><pattern id="dots-'+type+'" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".55" fill="#a7afb6"/></pattern></defs>';
  let content;
  if(type==='workspace') content = `<path d="M40 32h206v143H40z" fill="#fff"/><path d="M40 59h206M91 59v116"/><circle cx="51" cy="46" r="2"/><circle cx="59" cy="46" r="2"/><circle cx="67" cy="46" r="2"/><path d="M54 78h22m-22 15h16m-16 15h20m-20 15h14" stroke="#9aa3ab"/><rect x="105" y="75" width="126" height="24" rx="2"/><rect x="105" y="108" width="126" height="24" rx="2"/><rect x="105" y="141" width="126" height="20" rx="2"/><text x="116" y="91">IPMI Redirection</text><text x="116" y="124">SSH Channel</text><path d="M114 151h48" stroke="#9aa3ab"/><circle cx="218" cy="87" r="3"/><circle cx="218" cy="120" r="3" fill="#1d2935"/>`;
  if(type==='configuration') content = `<path d="M57 44h157v124H57z" fill="url(#dots-${type})"/><rect x="69" y="31" width="157" height="124" fill="#fff"/><text x="85" y="53" class="drawing-bold">Extension settings</text><path d="M85 65h125" stroke="#d0d5da"/><text x="85" y="86">Protocol</text><rect x="146" y="74" width="64" height="17" rx="2"/><text x="153" y="86">HTTPS</text><text x="85" y="113">Enabled</text><rect x="185" y="102" width="25" height="13" rx="7"/><circle cx="192" cy="108.5" r="4" fill="#1d2935"/><path d="M85 134h73" stroke="#c0c7cd"/><rect x="182" y="128" width="28" height="12" fill="#1d2935"/>`;
  if(type==='activation') content = `<path d="M72 104h39m53 0h38" stroke-dasharray="3 4"/><rect x="23" y="76" width="59" height="55" rx="2" fill="#fff"/><rect x="111" y="76" width="59" height="55" rx="2" fill="#fff"/><rect x="199" y="76" width="59" height="55" rx="2" fill="#fff"/><text x="34" y="110">Install</text><text x="121" y="110">Review</text><text x="210" y="110">Enable</text><path d="m103 100 4 4-4 4m87-8 4 4-4 4"/><path d="M135 42v17m-8-9h16" stroke="#8a959e"/><circle cx="229" cy="151" r="3" fill="#1d2935"/>`;
  if(type==='compatibility') content = `<path d="M53 33h173v134H53z" fill="#fff"/><text x="70" y="56" class="drawing-bold">Compatibility</text><path d="M70 68h139" stroke="#d0d5da"/><text x="70" y="90">CloudTower build</text><path d="m195 83 4 4 8-9"/><text x="70" y="117">Framework API</text><path d="m195 110 4 4 8-9"/><text x="70" y="144">Extension version</text><path d="m195 137 4 4 8-9"/><path d="M44 42v134h173" stroke="#c5cbd0"/>`;
  if(type==='audit') content = `<path d="M68 23h136l18 18v133H68z" fill="#fff"/><path d="M204 23v18h18M87 57h115" stroke="#c5cbd0"/><circle cx="91" cy="80" r="3"/><path d="M105 80h87m-87 9h57"/><circle cx="91" cy="110" r="3"/><path d="M105 110h87m-87 9h72"/><circle cx="91" cy="140" r="3"/><path d="M105 140h87m-87 9h48"/><path d="M54 37v150h151" stroke="#aeb8bf"/>`;
  if(type==='modular') content = `<path d="m142 32 70 39v79l-70 39-70-39V71z" fill="#fff"/><path d="m72 71 70 39 70-39m-70 39v79M107 52l70 39m-70 0 70-39m-70 39v78m35-39 35-19v59m-70-19 35 20 35-20"/><path d="m142 18 82 46v93l-82 46-82-46V64z" stroke="#b1bac1" stroke-dasharray="2 3"/>`;
  return `<svg class="feature-drawing" viewBox="0 0 280 210" fill="none" stroke="#27333d" stroke-width="1" aria-hidden="true">${defs}${content}</svg>`;
}

const features = [
  ['One extension center','Install, configure and manage your extensions in a shared workspace. Keep useful tools within reach.','workspace'],
  ['Independent settings','Each extension owns its configuration. Changes stay in a draft until you explicitly save them.','configuration'],
  ['Activate with intent','Installation and updates leave extensions disabled. Review compatibility, then enable what you need.','activation'],
  ['Version-aware by design','Check the exact CloudTower build and framework requirements before an extension can run.','compatibility'],
  ['A record of changes','Review management actions in the extension center, with the actor, outcome and time in view.','audit'],
  ['Modular at the core','Keep features and releases independent while sharing a consistent configuration and lifecycle.','modular'],
];

function footer() {
  return `<footer class="footer"><div class="container"><div class="footer-top"><div class="footer-brand"><a href="index.html" aria-label="Rivetin home">${brand}</a><p>Small extensions.<br>A better CloudTower.</p></div><div class="footer-column"><h3>Project</h3><a href="index.html#platform">Platform</a><a href="index.html#extensions">Extensions</a><a href="guide.html#development">Development status</a></div><div class="footer-column"><h3>Resources</h3><a href="guide.html">Documentation</a><a href="guide.html#compatibility">Compatibility</a><a href="${repository}" target="_blank" rel="noopener noreferrer">Source repository ${icon('external')}</a></div></div><div class="footer-bottom"><span>© 2026 Rivetin. MIT licensed.</span><p>Independent community project. Not affiliated with or endorsed by SmartX.</p><a href="https://rivetin.dev">rivetin.dev ${icon('external')}</a></div></div></footer>`;
}

function dialogs() {
  return extensions.map(e=>`<dialog class="extension-dialog" id="detail-${e.key}" aria-labelledby="dialog-title-${e.key}" aria-describedby="dialog-copy-${e.key}">
    <div class="dialog-content"><button class="dialog-close" aria-label="Close details">×</button>
      <span class="dialog-icon">${icon(e.icon)}</span><span class="badge">${e.release?.version===e.version?'Published package':e.status}</span>
      <h2 id="dialog-title-${e.key}">${e.name}</h2><code>${e.id}</code>
      <dl class="extension-facts"><div><dt>Source version</dt><dd>${e.version}</dd></div><div><dt>Rivetin 0.2 release</dt><dd>${e.currentRelease?`<code>${e.currentRelease.version}</code>`:'Not available'}</dd></div><div><dt>Historical v3 release</dt><dd>${e.legacyRelease?`<code>${e.legacyRelease.version}</code>`:'Not available'}</dd></div></dl>
      <h3 class="dialog-subheading">What it does</h3><ul class="capability-list">${e.capabilities.map(item=>`<li>${item}</li>`).join('')}</ul>
      <h3 class="dialog-subheading">Current boundary</h3><p id="dialog-copy-${e.key}">${e.detail}</p>
      <div class="dialog-compatibility"><strong>Declared Tower builds</strong><span>${e.declaredTowerBuilds.length?e.declaredTowerBuilds.join(', ')+' — declared version; acceptance is limited to the documented development/test scope.':'None. Live installation and activation remain gated.'}</span></div>
      <div class="dialog-note">Framework installers remain unavailable. Historical v3 packages do not pass the 0.2 gate.</div>
      <div class="hero-actions">
        <a class="text-link" href="guide.html#extension-workflow">Read the installation guide ${icon('external')}</a>
        ${e.release?`<a class="button button-dark" data-current-download href="${e.release.downloadPath}" download>Download for Rivetin 0.2 <code>${e.release.version}</code> ${icon('arrow')}</a>`:''}
        ${e.legacyRelease?`<a class="text-link" data-legacy-download href="${e.legacyRelease.downloadPath}" download>Historical v3 package <code>${e.legacyRelease.version}</code> ${icon('external')}</a>`:''}
      </div>
    </div></dialog>`).join('');
}

function home() {
  return `${head('Rivetin — Small extensions. A better CloudTower.','A modular extension platform for CloudTower. Bring practical tools, independent settings and deliberate control into one workspace.')}<body>${header()}<main id="main"><section class="hero container"><div class="hero-title"><h1>Rivetin</h1><h2>Small extensions.<br>A better CloudTower.</h2></div><div class="hero-side"><p>A modular home for the tools that make your infrastructure easier to manage.</p><div class="hero-actions"><a class="button button-dark" href="#extensions">Explore extensions ${icon('arrow')}</a><a class="text-link" href="guide.html">Read the docs ${icon('external')}</a></div><span class="preview-status"><i></i> Developer preview</span></div></section><section class="platform container" id="platform"><div class="platform-intro"><span class="section-label">Why Rivetin</span><div class="platform-statement"><h2>Independent tools.<br>A consistent experience.</h2><p>The small things make a difference.<br>Give them a place to work together.</p></div></div><div class="feature-grid">${features.map(([title,copy,type])=>`<article class="feature"><h3>${title}</h3><p>${copy}</p>${drawing(type)}</article>`).join('')}</div></section><section class="extensions-section container" id="extensions"><div class="section-heading"><div><span class="section-label">The extension library</span><h2>Built around<br>the work you do.</h2></div><p>Practical additions for everyday management.<br>Source snapshot · ${project.reviewedOn}</p></div><div class="extension-toolbar"><div class="filters" role="group" aria-label="Filter extensions"><button class="filter is-active" data-filter="all" aria-pressed="true">All extensions <span>6</span></button><button class="filter" data-filter="management" aria-pressed="false">Management</button><button class="filter" data-filter="infrastructure" aria-pressed="false">Infrastructure</button><button class="filter" data-filter="utilities" aria-pressed="false">Utilities</button></div><span class="result-count" role="status" aria-live="polite">6 extensions</span></div><div class="extension-list">${extensions.map(e=>`<article class="extension-row" id="extension-${e.key}" data-category="${e.category}"><div class="extension-title">${icon(e.icon)}<div class="extension-name"><h3>${e.name}</h3><span>v${e.version} · Source</span></div></div><p>${e.description}</p><span class="badge enhancement-badge">${e.enhancement}</span><button class="extension-open" data-extension="${e.key}" aria-label="View ${e.name}" aria-haspopup="dialog">${icon('external')}</button></article>`).join('')}</div><div class="library-note"><span class="note-dot"></span><div><p>Published v4 packages for Rivetin 0.2: <code data-catalog-v4-count>${project.catalogPublication.v4}</code>. Historical v3 packages for Rivetin 0.1: <code data-catalog-v3-count>${project.catalogPublication.v3}</code>. Published extensions across both catalogs: <code>${project.catalogPublication.uniqueExtensions}</code>. Framework installers are not publicly available.</p>${catalogReleaseNote()}</div></div></section><section class="start-section container" id="get-started"><div><span class="section-label">Getting started</span><h2>Start with<br>your environment.</h2><p>Understand the requirements, find the right build,<br>and choose the extensions that fit your workflow.</p><a class="button button-dark" href="guide.html">Read the installation guide ${icon('arrow')}</a></div><ol class="start-steps"><li><span>01</span><div><h3>Check compatibility</h3><p>Match your CloudTower build to the verified support list.</p></div></li><li><span>02</span><div><h3>Install the framework</h3><p>Use the portable CLI and keep recovery information close.</p></div></li><li><span>03</span><div><h3>Make it your own</h3><p>Configure an extension, review its scope, then enable it.</p></div></li></ol></section><section class="community-section container"><span class="section-label">A community project</span><h2>Built independently.<br>Made to be useful.</h2><p>A growing collection of focused tools for CloudTower.<br>Follow the project as the framework and extensions evolve.</p><a class="button button-outline" href="guide.html#development">Follow development ${icon('arrow')}</a><div class="community-art" aria-hidden="true"><svg viewBox="0 0 600 160" fill="none"><path d="M0 80h145l35-35h95m325 35H455l-35-35h-95M40 120h140l25-25h70m285 25H420l-25-25h-70M100 10v20l60 60h115m225-80v20l-60 60H325"/><rect x="275" y="25" width="50" height="90" rx="4"/><circle cx="300" cy="70" r="11"/><path d="M290 70h20m-10-10v20"/><circle cx="145" cy="80" r="3"/><circle cx="455" cy="80" r="3"/><circle cx="40" cy="120" r="3"/><circle cx="560" cy="120" r="3"/></svg></div></section></main>${footer()}${dialogs()}</body></html>`;
}

function guide() {
  return `${head('Documentation — Rivetin','Installation reference, platform clients, extension workflows and current development status for Rivetin.','guide.html')}<body>${header(true)}${documentation({project,extensions,repository,icon})}${footer()}</body></html>`;
}

export const pages = {
  'index.html':home(),
  'guide.html':guide(),
  '404.html':`${head('Page not found — Rivetin','The requested page could not be found.','404.html')}<body>${header(true)}<main id="main" class="not-found container"><span class="section-label">404 / Page not found</span><h1>This page<br>isn’t connected yet.</h1><p>Head back to Rivetin and pick up where you left off.</p><a class="button button-dark" href="index.html">Back to Rivetin ${icon('arrow')}</a></main>${footer()}</body></html>`,
};
