const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const HOOKS = new Set(['useState','useEffect','useContext','useReducer','useCallback','useMemo','useRef','useImperativeHandle','useLayoutEffect','useDebugValue','useId','useTransition','useDeferredValue']);

function walk(dir){const out=[]; for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name); if(ent.isDirectory()) out.push(...walk(p)); else if(/\.(jsx|js)$/.test(ent.name)) out.push(p);} return out;}
function getName(fnPath){const n=fnPath.node; if(n.id?.name) return n.id.name; const p=fnPath.parent; if(p?.type==='VariableDeclarator'&&p.id.type==='Identifier') return p.id.name; return '(anonymous)';}
function isCompOrHook(name){return /^use[A-Z0-9_]/.test(name)||/^[A-Z]/.test(name);} 
function stmtContainsHook(stmt){let found=false; traverse(stmt,{noScope:true, CallExpression(p){if(p.node.callee.type==='Identifier'&&HOOKS.has(p.node.callee.name)) found=true;}}); return found;}
function stmtHasDirectGuardReturn(stmt){
  if(stmt.type==='IfStatement'){
    const c=stmt.consequent;
    if(c?.type==='ReturnStatement') return c.loc?.start?.line;
    if(c?.type==='BlockStatement' && c.body.length===1 && c.body[0].type==='ReturnStatement') return c.body[0].loc?.start?.line;
  }
  return null;
}

const issues=[];
for(const file of walk(path.join(process.cwd(),'src'))){
  const code=fs.readFileSync(file,'utf8'); let ast;
  try{ast=parser.parse(code,{sourceType:'module',plugins:['jsx']});}catch{continue;}
  traverse(ast,{
    FunctionDeclaration(fn){check(fn,file);},
    FunctionExpression(fn){check(fn,file);},
    ArrowFunctionExpression(fn){check(fn,file);}
  });
}
function check(fn,file){
  const name=getName(fn); if(!isCompOrHook(name)) return;
  const body=fn.node.body; if(!body||body.type!=='BlockStatement') return;
  const stmts=body.body;
  let firstHookIdx=-1;
  for(let i=0;i<stmts.length;i++){ if(stmtContainsHook(stmts[i])) { firstHookIdx=i; break; } }
  if(firstHookIdx<=0) return;
  for(let i=0;i<firstHookIdx;i++){
    const line=stmtHasDirectGuardReturn(stmts[i]);
    if(line){ issues.push({file,line,name}); break; }
  }
}
if(!issues.length) console.log('NO_EARLY_GUARD_BEFORE_HOOKS');
else issues.forEach(i=>console.log(`${path.relative(process.cwd(),i.file)}:${i.line} ${i.name}`));
