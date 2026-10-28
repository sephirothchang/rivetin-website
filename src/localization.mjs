import { messages, richMessages } from './zh-CN.mjs';

const labels = {
  'Rivetin home':'Rivetin 首页', 'Main navigation':'主导航',
  'Mobile navigation':'移动导航', 'Open navigation':'打开导航',
  'Close navigation':'关闭导航', 'Close details':'关闭详情',
  'Filter extensions':'筛选扩展', 'Client operating system':'客户端操作系统',
  'GitHub repository (access currently required)':'GitHub 仓库（需要访问权限）',
  'A modular extension platform for CloudTower. Bring practical tools, independent settings and deliberate control into one workspace.':'面向 CloudTower 的模块化扩展平台，将实用工具、独立设置和明确的控制汇集于同一工作区。',
  'Installation reference, platform clients, extension workflows and current development status for Rivetin.':'Rivetin 安装参考、平台客户端、扩展工作流与当前开发状态。',
  'The requested page could not be found.':'找不到请求的页面。',
};

function translate(text) {
  if (Object.hasOwn(messages,text)) return messages[text];
  if (Object.hasOwn(labels,text)) return labels[text];
  if (text.startsWith('View ')) return `查看${translate(text.slice(5))}`;
  if (text.startsWith('Copy ')) return `复制：${translate(text.slice(5))}`;
  if (/\p{Script=Han}/u.test(text) || !/[A-Za-z]/u.test(text)) return text;
  throw new Error(`Review missing Chinese translation: ${text}`);
}

// Translate generated text only. Code blocks and inline identifiers stay intact.
function chineseHtml(html) {
  html = html.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gu, (whole,attrs,body) => {
    if (!body.includes('<code')) return whole;
    const code = [];
    const key = body.replace(/<code\b[^>]*>[\s\S]*?<\/code>/gu, block => `{${code.push(block)-1}}`);
    if (!Object.hasOwn(richMessages,key)) throw new Error(`Review missing Chinese paragraph: ${key}`);
    return `<p${attrs}>${richMessages[key].replace(/\{(\d+)\}/gu,(_,i)=>code[Number(i)])}</p>`;
  });
  let protectedDepth = 0;
  return html.replace(/<[^>]+>|[^<]+/gu, token => {
    if (token.startsWith('<')) {
      if (/^<\/(?:pre|code|script|style)\b/iu.test(token)) protectedDepth--;
      else if (/^<(?:pre|code|script|style)\b/iu.test(token)) protectedDepth++;
      token = token.replace(/aria-label="([^"]+)"/gu,(_,text)=>`aria-label="${translate(text)}"`);
      if (/^<meta name="description"/u.test(token)) token=token.replace(/content="([^"]+)"/u,(_,text)=>`content="${translate(text)}"`);
      return token;
    }
    if (protectedDepth || !token.trim()) return token;
    return token.replace(token.trim(),translate(token.trim()));
  });
}

function languageLinks(html, locale, page) {
  const chinese=locale==='zh-CN';
  const target=chinese?`../${page}`:`zh/${page}`;
  const control=`<a class="language-link" data-language-switch href="${target}" lang="${chinese?'en':'zh-CN'}" hreflang="${chinese?'en':'zh-CN'}" aria-label="${chinese?'Switch to English':'Switch to Chinese'}">${chinese?'EN':'中文'}</a>`;
  html=html.replace('<button class="mobile-toggle"',`${control}<button class="mobile-toggle"`);
  const suffix=page==='index.html'?'':page;
  const alternates=`<link rel="alternate" hreflang="en" href="https://rivetin.dev/${suffix}"><link rel="alternate" hreflang="zh-CN" href="https://rivetin.dev/zh/${suffix}"><link rel="alternate" hreflang="x-default" href="https://rivetin.dev/${suffix}">`;
  html=html.replace('</head>',`${alternates}</head>`);
  if (chinese) {
    html=html.replace('<html lang="en">','<html lang="zh-CN">');
    html=html.replace(/((?:href|src)=")assets\//gu,'$1../assets/');
    html=html.replace('<base href="/">','<base href="/zh/">');
    html=html.replace(/(<link rel="canonical" href=")https:\/\/rivetin\.dev\//u,'$1https://rivetin.dev/zh/');
  }
  return html;
}

export function localizedPages(englishPages) {
  const result={};
  for (const [page,html] of Object.entries(englishPages)) {
    result[page]=languageLinks(html,'en',page);
    result[`zh/${page}`]=languageLinks(chineseHtml(html),'zh-CN',page);
  }
  return result;
}
