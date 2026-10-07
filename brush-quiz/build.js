/* 刷题助手 · 发布版构建
   用法：node build.js
   输入 index.dev.html（带注释、缩进，平时改这个）
   输出 index.html      （压缩单文件，发给手机/自己用）

   压缩原则是「宁可少压一点，也不能改坏语义」：
   - 只删注释与缩进；换行只压成一个，绝不整段合并（换行本身有 ASI 语义）
   - 字符串 / 模板串 / 正则字面量内部原样保留，不参与任何规则
------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'index.dev.html');
const OUT = path.join(__dirname, 'index.html');

/* ---------- CSS ---------- */
function minifyCSS(css){
  let out = css.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/\s+/g, ' ');
  out = out.replace(/\s*([{}:;,>])\s*/g, '$1');
  out = out.replace(/;\}/g, '}');
  return out.trim();
}

/* ---------- JS ---------- */
// 这些符号/关键字后面出现的 / 视为正则开始，其余视为除法
const REGEX_BEFORE = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';',
  '+', '-', '*', '%', '~', '^', '<', '>', '\n']);
const REGEX_KEYWORD = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete',
  'void', 'instanceof', 'do', 'else', 'yield', 'await', 'throw', 'prev']);
const isIdChar = ch => /[A-Za-z0-9_$]/.test(ch);
// 是不是"词字符"（含中文等）；两个词字符之间的空格必须保留，否则 return x 会变成 returnx
const isWord = ch => /[\w$\u0080-\uffff]/.test(ch);
// 判断某个空格能不能安全删掉
function needSpace(a, b){
  if(!a || !b) return false;
  if(isWord(a) || isWord(b)) return true;                       // 关键字/标识符旁边必须留
  if((a === '/' && (b === '/' || b === '*')) || (a === '*' && b === '/')) return true;   // 不能凑出注释
  if((a === '+' && b === '+') || (a === '-' && b === '-')) return true;                  // 不能凑出 ++/--
  if(a === '.' && b === '.') return true;
  if(a === b && (a === '<' || a === '>')) return true;
  if(a === '\\') return true;
  return false;
}

function minifyJS(src){
  const n = src.length;
  let out = '';
  let i = 0;
  let prev = '';                 // 上一个有语义的片段

  // 普通字符串：原样搬
  const copyStr = (start, quote) => {
    let j = start + 1, s = quote;
    while(j < n){
      const ch = src[j];
      if(ch === '\\'){ s += src.substr(j, 2); j += 2; continue; }
      s += ch; j++;
      if(ch === quote) break;
    }
    return [s, j];
  };
  // 模板串：${} 里的表达式原样搬（里面可能有字符串/注释，保守处理）
  const copyTpl = (start) => {
    let j = start + 1, s = '`';
    while(j < n){
      const ch = src[j];
      if(ch === '\\'){ s += src.substr(j, 2); j += 2; continue; }
      if(ch === '`'){ s += ch; j++; break; }
      if(ch === '$' && src[j+1] === '{'){
        s += '${'; j += 2;
        let depth = 1;
        while(j < n && depth > 0){
          const c2 = src[j];
          if(c2 === '{') depth++;
          else if(c2 === '}'){ depth--; if(!depth){ s += '}'; j++; break; } }
          s += c2; j++;
        }
        continue;
      }
      s += ch; j++;
    }
    return [s, j];
  };

  while(i < n){
    const c = src[i];

    if(c === '"' || c === "'"){
      const [s, j] = copyStr(i, c);
      out += s; i = j; prev = 'str';
      continue;
    }
    if(c === '`'){
      const [s, j] = copyTpl(i);
      out += s; i = j; prev = '`';
      continue;
    }
    // 行注释 / 块注释
    if(c === '/' && src[i+1] === '/'){
      while(i < n && src[i] !== '\n') i++;
      continue;
    }
    if(c === '/' && src[i+1] === '*'){
      i += 2;
      while(i < n && !(src[i] === '*' && src[i+1] === '/')) i++;
      i += 2;
      continue;
    }
    // 正则字面量
    if(c === '/' && (REGEX_BEFORE.has(prev) || REGEX_KEYWORD.has(prev))){
      let j = i + 1, inCls = false, s = '/';
      while(j < n){
        const ch = src[j];
        if(ch === '\\'){ s += src.substr(j, 2); j += 2; continue; }
        if(ch === '[') inCls = true;
        else if(ch === ']') inCls = false;
        else if(ch === '/' && !inCls){ s += ch; j++; break; }
        else if(ch === '\n'){ break; }              // 异常：不跨行
        s += ch; j++;
      }
      while(j < n && /[a-z]/.test(src[j])){ s += src[j]; j++; }
      out += s; i = j; prev = 're';
      continue;
    }
    // 空白：含换行就保留一个换行；否则看上下文决定这个空格要不要保留
    if(/\s/.test(c)){
      let j = i, hasNL = false;
      while(j < n && /\s/.test(src[j])){ if(src[j] === '\n') hasNL = true; j++; }
      if(hasNL){ out += '\n'; }
      else if(needSpace(out[out.length-1], src[j])){ out += ' '; }
      i = j;
      // 换行本身是"语义分隔"，参与 / 的判断
      if(hasNL) prev = '\n';
      continue;
    }
    // 标识符整体搬
    if(isIdChar(c)){
      let j = i, w = '';
      while(j < n && isIdChar(src[j])){ w += src[j]; j++; }
      out += w; i = j; prev = w;
      continue;
    }
    out += c; prev = c; i++;
  }
  return out.split('\n').map(l => l.trim()).filter(l => l !== '').join('\n');
}

/* ---------- 主流程 ---------- */
const html = fs.readFileSync(SRC, 'utf8');
const before = Buffer.byteLength(html, 'utf8');

let out = html;
out = out.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
out = out.replace(/(<style>)([\s\S]*?)(<\/style>)/, (m, a, css, b) => a + minifyCSS(css) + b);
out = out.replace(/(<script>)([\s\S]*?)(<\/script>)/, (m, a, js, b) => a + minifyJS(js) + b);
out = out.replace(/\n\s*\n/g, '\n');
out = out.replace(/>\s+</g, '><');
out = '<!-- 刷题助手 · 发布版（由 build.js 从 index.dev.html 自动生成，请勿直接改这个文件） -->\n' + out.trim() + '\n';

fs.writeFileSync(OUT, out, 'utf8');
const after = Buffer.byteLength(out, 'utf8');
console.log('开发版 index.dev.html : ' + (before / 1024).toFixed(0) + ' KB');
console.log('发布版 index.html      : ' + (after / 1024).toFixed(0) + ' KB  （压缩 ' + Math.round((1 - after / before) * 100) + '%）');
