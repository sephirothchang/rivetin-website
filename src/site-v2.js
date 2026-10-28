const chinese = document.documentElement.lang === 'zh-CN';
const ui = chinese ? {open:'打开导航',close:'关闭导航',copy:'复制',copied:'已复制',select:'选择代码'} : {open:'Open navigation',close:'Close navigation',copy:'Copy',copied:'Copied',select:'Select code'};
const languageLink=document.querySelector('[data-language-switch]');
if(languageLink){
  const target=new URL(languageLink.getAttribute('href'),document.baseURI);
  const updateLanguageHash=()=>{target.hash=location.hash;languageLink.href=target.href;};
  updateLanguageHash();
  window.addEventListener('hashchange',updateLanguageHash);
}

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
      button.textContent=ui.copied;
    } catch {
      button.textContent=ui.select;
      const selection=window.getSelection();
      const range=document.createRange();
      range.selectNodeContents(code);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    window.setTimeout(()=>{button.textContent=ui.copy;},2000);
  });
});
