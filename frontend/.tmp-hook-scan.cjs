const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const HOOKS = new Set(['useState','useEffect','useContext','useReducer','useCallback','useMemo','useRef','useImperativeHandle','useLayoutEffect','useDebugValue','useId','useTransition','useDeferredValue']);
const bad = [];

function walk(dir){
  const out=[];
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory()) out.push(...walk(p));
    else if(/\.(jsx|js)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function fnName(pathNode){
  const n=pathNode.node;
  if(n.id && n.id.name) return n.id.name;
  const parent = pathNode.parent;
  if(parent && parent.type==='VariableDeclarator' && parent.id.type==='Identifier') return parent.id.name;
  if(parent && parent.type==='ObjectProperty' && parent.key.type==='Identifier') return parent.key.name;
  return '(anonymous)';
}

function isComponentOrHook(name){
  return /^use[A-Z0-9_]/.test(name) || /^[A-Z]/.test(name);
}

for(const file of walk(path.join(process.cwd(),'src'))){
  const code = fs.readFileSync(file,'utf8');
  let ast;
  try{
    ast = parser.parse(code,{sourceType:'module',plugins:['jsx']});
  }catch(e){ continue; }

  traverse(ast,{
    FunctionDeclaration(pathFn){ checkFn(pathFn,file); },
    FunctionExpression(pathFn){ checkFn(pathFn,file); },
    ArrowFunctionExpression(pathFn){ checkFn(pathFn,file); }
  });
}

function checkFn(pathFn,file){
  const name = fnName(pathFn);
  if(!isComponentOrHook(name)) return;
  pathFn.traverse({
    CallExpression(callPath){
      const callee = callPath.node.callee;
      if(callee.type !== 'Identifier' || !HOOKS.has(callee.name)) return;
      if(callPath.getFunctionParent() !== pathFn) return; // nested fn own hooks handled separately

      // must be directly under function body statement/expression, not nested in control flow blocks
      let p = callPath.parentPath;
      let invalid = false;
      while(p && p !== pathFn){
        const t = p.node.type;
        if(['IfStatement','ConditionalExpression','ForStatement','ForInStatement','ForOfStatement','WhileStatement','DoWhileStatement','SwitchCase','TryStatement','CatchClause','LogicalExpression'].includes(t)) {
          invalid = true; break;
        }
        if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(t)) {
          invalid = true; break;
        }
        p = p.parentPath;
      }
      if(invalid){
        bad.push({file, line: callPath.node.loc.start.line, fn:name, hook: callee.name});
      }
    }
  });
}

if(!bad.length){
  console.log('NO_INVALID_HOOKS_FOUND');
}else{
  for(const b of bad){
    console.log(`${path.relative(process.cwd(),b.file)}:${b.line} ${b.fn} -> ${b.hook}`);
  }
}
