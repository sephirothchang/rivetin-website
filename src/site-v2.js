let chinese = false;
let ui = {open:'Open navigation',close:'Close navigation',copy:'Copy',copied:'Copied',select:'Select code'};
const languageLink = document.querySelector('[data-language-switch]');
const englishTitle = document.title;
const descriptionMeta = document.querySelector('meta[name="description"]');
const englishDescription = descriptionMeta?.content;
let languageDictionary;
let translationEntries;

function loadLanguageDictionary() {
  if (!languageDictionary) languageDictionary=fetch(new URL('assets/zh-CN.json',document.baseURI),{credentials:'omit',cache:'no-cache'})
    .then(response=>{if(!response.ok)throw new Error('Language unavailable');return response.json();})
    .catch(error=>{languageDictionary=undefined;throw error;});
  return languageDictionary;
}
function translated(text,dictionary) {
  if(Object.hasOwn(dictionary.messages,text))return dictionary.messages[text];
  if(Object.hasOwn(dictionary.labels,text))return dictionary.labels[text];
  if(text.startsWith('View '))return '查看'+translated(text.slice(5),dictionary);
  if(text.startsWith('Copy '))return '复制：'+translated(text.slice(5),dictionary);
  return text;
}
function collectTranslationEntries(dictionary) {
  const paragraphs=[];
  const richElements=new Set();
  document.querySelectorAll('p').forEach(element=>{
    if(!element.querySelector('code'))return;
    const code=[];
    const english=element.innerHTML;
    const key=english.replace(/<code\b[^>]*>[\s\S]*?<\/code>/gu,block=>'{'+(code.push(block)-1)+'}');
    if(!Object.hasOwn(dictionary.richMessages,key))return;
    const chineseHtml=dictionary.richMessages[key].replace(/\{(\d+)\}/gu,(_,i)=>code[Number(i)]);
    paragraphs.push({element,english,chineseHtml});richElements.add(element);
  });
  const texts=[];
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
    const node=walker.currentNode,parent=node.parentElement;
    if(!parent||parent.closest('pre,code,script,style,[data-language-switch],.copy-code,.result-count')||richElements.has(parent.closest('p')))continue;
    const english=node.nodeValue,key=english.trim();
    if(key)texts.push({node,english,chineseText:english.replace(key,translated(key,dictionary))});
  }
  const attributes=[...document.querySelectorAll('[aria-label]')].filter(element=>element!==languageLink&&element!==mobileButton).map(element=>({element,english:element.getAttribute('aria-label')}));
  return {paragraphs,texts,attributes};
}
function updateLocaleUI() {
  ui=chinese?{open:'打开导航',close:'关闭导航',copy:'复制',copied:'已复制',select:'选择代码'}:{open:'Open navigation',close:'Close navigation',copy:'Copy',copied:'Copied',select:'Select code'};
  mobileButton?.setAttribute('aria-label',mobileButton.getAttribute('aria-expanded')==='true'?ui.close:ui.open);
  const count=document.querySelector('.result-count');
  if(count){const visible=[...document.querySelectorAll('.extension-row')].filter(row=>!row.hidden).length;count.textContent=chinese?visible+' 个扩展':visible+' extension'+(visible===1?'':'s');}
  document.querySelectorAll('.copy-code').forEach(button=>{button.textContent=ui[button.dataset.copyState||'copy'];});
  if(languageLink){languageLink.textContent=chinese?'EN':'中文';languageLink.setAttribute('aria-label',chinese?'Switch to English':'Switch to Chinese');}
}
async function setLanguage(locale,remember=true) {
  const nextChinese=locale==='zh-CN';
  if(nextChinese===chinese)return;
  const dictionary=await loadLanguageDictionary();
  if(!translationEntries)translationEntries=collectTranslationEntries(dictionary);
  const anchor=[...document.querySelectorAll('.hero-title,.feature,.extension-row,.section-heading,.docs-content h1,.docs-content h2,.docs-content p,.code-block')].map(element=>({element,rect:element.getBoundingClientRect()})).filter(({rect})=>rect.bottom>100&&rect.top<innerHeight).sort((a,b)=>Math.abs(a.rect.top-110)-Math.abs(b.rect.top-110))[0]?.element;
  const anchorTop=anchor?.getBoundingClientRect().top;
  const previousScroll=scrollY;
  translationEntries.paragraphs.forEach(({element,english,chineseHtml})=>{element.innerHTML=nextChinese?chineseHtml:english;});
  translationEntries.texts.forEach(({node,english,chineseText})=>{node.nodeValue=nextChinese?chineseText:english;});
  translationEntries.attributes.forEach(({element,english})=>element.setAttribute('aria-label',nextChinese?translated(english,dictionary):english));
  chinese=nextChinese;
  document.documentElement.lang=chinese?'zh-CN':'en';
  document.title=chinese?translated(englishTitle,dictionary):englishTitle;
  if(descriptionMeta)descriptionMeta.content=chinese?translated(englishDescription,dictionary):englishDescription;
  updateLocaleUI();
  const delta=anchor?.isConnected?anchor.getBoundingClientRect().top-anchorTop:0;
  window.scrollTo({top:previousScroll+delta,behavior:'instant'});
  if(remember){try{sessionStorage.setItem('rivetin.site.language',locale);}catch{}}
}
languageLink?.addEventListener('click',async()=>{
  languageLink.disabled=true;
  try{await setLanguage(chinese?'en':'zh-CN');languageLink.removeAttribute('title');}
  catch{languageLink.title=chinese?'语言暂不可用，请重试。':'Language unavailable. Please try again.';}
  finally{languageLink.disabled=false;}
});

const dropdownButton = document.querySelector('.nav-trigger');
const dropdown = document.querySelector('.nav-popover');
const mobileButton = document.querySelector('.mobile-toggle');
const mobileMenu = document.querySelector('.mobile-menu');

function closeDropdown() {
  dropdownButton?.setAttribute('aria-expanded','false');
  if(dropdown) dropdown.hidden = true;
}
function closeMobile() {
  mobileButton?.setAttribute('aria-expanded','false');
  mobileButton?.setAttribute('aria-label',ui.open);
  if(mobileMenu) mobileMenu.hidden = true;
}
dropdownButton?.addEventListener('click',()=>{
  const open = dropdownButton.getAttribute('aria-expanded') !== 'true';
  dropdownButton.setAttribute('aria-expanded',String(open));
  dropdown.hidden = !open;
});
mobileButton?.addEventListener('click',()=>{
  const open = mobileButton.getAttribute('aria-expanded') !== 'true';
  mobileButton.setAttribute('aria-expanded',String(open));
  mobileButton.setAttribute('aria-label',open?ui.close:ui.open);
  mobileMenu.hidden = !open;
});
dropdown?.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeDropdown));
dropdown?.querySelectorAll('a[href*="#extension-"]').forEach(link=>link.addEventListener('click',()=>{
  document.querySelector('[data-filter="all"]')?.click();
}));
mobileMenu?.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMobile));
document.addEventListener('click',event=>{
  if(!event.target.closest('.nav-dropdown')) closeDropdown();
});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape') return;
  if(dropdownButton?.getAttribute('aria-expanded')==='true') { closeDropdown(); dropdownButton.focus(); }
  if(mobileButton?.getAttribute('aria-expanded')==='true') { closeMobile(); mobileButton.focus(); }
});
matchMedia('(min-width:601px)').addEventListener('change',event=>{
  if(event.matches) closeMobile(); else closeDropdown();
});

document.querySelectorAll('[data-filter]').forEach(button=>{
  button.addEventListener('click',()=>{
    document.querySelectorAll('[data-filter]').forEach(item=>{
      item.classList.toggle('is-active',item===button);
      item.setAttribute('aria-pressed',String(item===button));
    });
    let count=0;
    document.querySelectorAll('.extension-row').forEach(row=>{
      row.hidden = button.dataset.filter!=='all' && row.dataset.category!==button.dataset.filter;
      if(!row.hidden) count++;
    });
    document.querySelector('.result-count').textContent = chinese?`${count} 个扩展`:`${count} extension${count===1?'':'s'}`;
  });
});

document.querySelectorAll('[data-extension]').forEach(button=>{
  button.addEventListener('click',()=>{
    const dialog=document.getElementById(`detail-${button.dataset.extension}`);
    dialog.showModal();
    dialog.querySelector('.dialog-close').focus();
  });
});
document.querySelectorAll('.extension-dialog').forEach(dialog=>{
  dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    const rect=dialog.getBoundingClientRect();
    if(event.target===dialog && (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)) dialog.close();
  });
});

const osTabs=[...document.querySelectorAll('[data-os]')];
const cliExamples=[...document.querySelectorAll('[data-cli-command]')].map(code=>({code,template:code.textContent}));
function activateTab(tab,focus=false) {
  osTabs.forEach(button=>{
    const selected=button===tab;
    button.setAttribute('aria-selected',String(selected));
    button.tabIndex=selected?0:-1;
    document.getElementById(button.getAttribute('aria-controls')).hidden=!selected;
  });
  if(tab.dataset.cliExecutable) {
    cliExamples.forEach(({code,template})=>{
      code.textContent=template.replace(/^rivetin(?=\s)/gm,()=>tab.dataset.cliExecutable);
    });
  }
  if(focus) tab.focus();
}
osTabs.forEach((tab,index)=>{
  tab.addEventListener('click',()=>activateTab(tab));
  tab.addEventListener('keydown',event=>{
    const next=event.key==='ArrowRight'?(index+1)%osTabs.length:event.key==='ArrowLeft'?(index+osTabs.length-1)%osTabs.length:event.key==='Home'?0:event.key==='End'?osTabs.length-1:null;
    if(next===null) return;
    event.preventDefault();
    activateTab(osTabs[next],true);
  });
});
if(osTabs.length) activateTab(osTabs.find(tab=>tab.getAttribute('aria-selected')==='true')??osTabs[0]);

document.querySelectorAll('.copy-code').forEach(button=>{
  button.addEventListener('click',async()=>{
    const code=button.closest('.code-block').querySelector('code');
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.dataset.copyState='copied';
      button.textContent=ui.copied;
    } catch {
      button.dataset.copyState='select';
      button.textContent=ui.select;
      const selection=window.getSelection();
      const range=document.createRange();
      range.selectNodeContents(code);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    window.setTimeout(()=>{button.dataset.copyState='copy';button.textContent=ui.copy;},2000);
  });
});

try { if(sessionStorage.getItem('rivetin.site.language')==='zh-CN')setLanguage('zh-CN',false).catch(()=>{}); } catch {}
