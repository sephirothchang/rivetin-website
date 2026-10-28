import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { attachProjectState } from '../src/extension-copy.mjs';

// Optional offline QA reuses the adjacent project's installed jsdom. It does not
// load URLs, fetch resources, launch a browser, or access the system clipboard.
const root = path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const require = createRequire(path.join(root,'../smartx-extensions/framework/package.json'));
const { JSDOM } = require('jsdom');
const script = await readFile(path.join(root,'dist/assets/site.js'),'utf8');
const passed = [];
const errors = [];
async function document(name) {
  const dom = new JSDOM(await readFile(path.join(root,'dist',name),'utf8'),{runScripts:'outside-only'});
  dom.window.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}});
  dom.window.document.addEventListener('click',event => {if(event.target.closest('a')) event.preventDefault();});
  dom.window.addEventListener('error',event => errors.push(event.error ?? event.message));
  dom.window.eval(script);
  return dom;
}
const home = await document('index.html');
const h = home.window.document;
const visibleRows = () => [...h.querySelectorAll('.extension-row')].filter(row=>!row.hidden);
for (const [category,count] of [['management',2],['infrastructure',3],['utilities',1],['all',6]]) {
  h.querySelector(`[data-filter="${category}"]`).click();
  assert.equal(visibleRows().length,count);
  assert.equal(h.querySelector('.result-count').textContent,`${count} extension${count===1?'':'s'}`);
}
passed.push('all four catalog filters and counts');
h.querySelector('.nav-trigger').click();
assert.equal(h.querySelector('#extensions-menu').hidden,false);
h.dispatchEvent(new home.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
assert.equal(h.querySelector('#extensions-menu').hidden,true);
h.querySelector('[data-filter="utilities"]').click();
h.querySelector('.nav-trigger').click();
h.querySelector('#extensions-menu a[href="#extension-ipmi"]').click();
assert.equal(visibleRows().length,6);
assert.equal(h.querySelector('#extensions-menu').hidden,true);
passed.push('dropdown keyboard close and navigation filter reset');
for(const button of h.querySelectorAll('[data-extension]')) {
  const dialog = h.querySelector(`#detail-${button.dataset.extension}`);
  assert.ok(dialog);
  assert.ok(h.getElementById(dialog.getAttribute('aria-labelledby')));
  assert.equal(dialog.querySelectorAll('.capability-list li').length,3);
  assert.match(dialog.querySelector('.extension-facts').textContent,/Source version/u);
}
passed.push('six detail structures, identities and capability lists');
home.window.close();

const docs = await document('guide.html');
const d = docs.window.document;
const cliBlocks = [...d.querySelectorAll('[data-cli-command]')];
assert.ok(cliBlocks.length>=10);
const allCommandsUse = prefix => cliBlocks.every(code=>code.textContent.split('\n').every(line=>line.startsWith(prefix+' ')));
assert.ok(allCommandsUse('.\\rivetin-windows-amd64.exe'));
d.querySelector('[data-os="1"]').click();
assert.ok(allCommandsUse('./rivetin-darwin-arm64'));
assert.equal(d.querySelectorAll('[role="tabpanel"]:not([hidden])').length,1);
d.querySelector('[data-os="1"]').dispatchEvent(new docs.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
assert.ok(allCommandsUse('./rivetin-linux-amd64'));
assert.equal(d.querySelector('[role="tab"][aria-selected="true"]').textContent,'Linux');
assert.equal(d.activeElement,d.querySelector('[data-os="2"]'));
assert.ok(cliBlocks.some(code=>code.textContent.includes('SHA256:<VERIFIED_HOST_KEY>')));
assert.ok([...d.querySelectorAll('.code-block code')].some(code=>code.textContent.startsWith('node cli/scripts/prepare.mjs')));
passed.push('platform executable paths, keyboard tabs and preserved placeholders');
let copied;
Object.defineProperty(docs.window.navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text;}}});
const button = d.querySelector('.copy-code');
button.click();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(button.textContent,'Copied');
assert.equal(copied,cliBlocks[0].textContent);
assert.ok(copied.startsWith('./rivetin-linux-amd64 help'));
passed.push('copy uses the currently selected platform command (memory mock)');
Object.defineProperty(docs.window.navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('clipboard unavailable');}}});
button.click();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(button.textContent,'Select code');
assert.equal(docs.window.getSelection().toString(),cliBlocks[0].textContent);
passed.push('unavailable clipboard selects the command text');
docs.window.close();

const state = JSON.parse(await readFile(path.join(root,'src/project-state.json'),'utf8'));
const drifted = structuredClone(state);
drifted.extensions[0].version = '9.9.9';
assert.throws(()=>attachProjectState(drifted),/Review website copy/u);
passed.push('a changed source version requires copy review');
assert.deepEqual(errors,[],'Unexpected application errors in offline DOM checks');
console.log(JSON.stringify({result:'PASS',mode:'offline DOM; no network or visual rendering',groups:passed},null,2));
