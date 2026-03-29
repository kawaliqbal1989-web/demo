const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
function walk(d){const o=[]; for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name); if(e.isDirectory()) o.push(...walk(p)); else if(/\.(jsx|js)$/.test(e.name)) o.push(p);} return o;}
for(const file of walk(path.join(process.cwd(),'src'))){
  const code=fs.readFileSync(file,'utf8'); let ast;
  try{ ast=parser.parse(code,{sourceType:'module',plugins:['jsx']}); } catch { continue; }
  const imported = new Set();
  traverse(ast,{ImportDeclaration(p){for(const s of p.node.specifiers){ if(s.local?.name) imported.add(s.local.name); }}});
  traverse(ast,{CallExpression(p){const c=p.node.callee; if(c.type==='Identifier' && /^[A-Z]/.test(c.name) && imported.has(c.name)){
    const parent = p.parentPath.node.type;
    if(parent !== 'JSXExpressionContainer'){ // still suspicious even inside expression maybe fine
      console.log(`${path.relative(process.cwd(),file)}:${p.node.loc.start.line} ${c.name}()`);
    }
  }}});
}
