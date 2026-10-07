// Parse JSON-with-comments and update one property without rewriting unrelated text.
export function parseJsonc(source) {
  let i=0;
  const fail=()=>{throw new Error(`Invalid JSON/JSONC near offset ${i}`);};
  function skip() {
    while(i<source.length) {
      if(/\s/.test(source[i])) {i++;continue;}
      if(source.slice(i,i+2)==='//') {i+=2;while(i<source.length&&source[i]!=='\n')i++;continue;}
      if(source.slice(i,i+2)==='/*') {const end=source.indexOf('*/',i+2);if(end<0)fail();i=end+2;continue;}
      break;
    }
  }
  function string() {
    const start=i++;
    while(i<source.length) {
      if(source[i]==='\\') {i+=2;continue;}
      if(source[i++]==='"') return {start,end:i,value:JSON.parse(source.slice(start,i))};
    }
    fail();
  }
  function value() {
    skip();const start=i;
    if(source[i]==='"') return string();
    if(source[i]==='{') {
      i++;const members=[],data=Object.create(null);let trailing=false;
      skip();
      while(source[i]!=='}') {
        if(source[i]!=='"')fail();const key=string();skip();if(source[i++]!==':')fail();
        if(Object.hasOwn(data,key.value))throw new Error('Duplicate JSON key; merge manually.');
        const child=value();data[key.value]=child.value;members.push({key:key.value,node:child});skip();
        if(source[i]===',') {i++;skip();if(source[i]==='}') {trailing=true;break;}}
        else if(source[i]!=='}')fail();
      }
      const close=i++;return {start,end:i,close,members,trailing,value:data};
    }
    if(source[i]==='[') {
      i++;const data=[];skip();
      while(source[i]!==']') {
        data.push(value().value);skip();
        if(source[i]===',') {i++;skip();if(source[i]===']')break;}
        else if(source[i]!==']')fail();
      }
      i++;return {start,end:i,value:data};
    }
    const token=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(i));
    if(!token)fail();i+=token[0].length;return {start,end:i,value:JSON.parse(token[0])};
  }
  const root=value();skip();if(i!==source.length)fail();return root;
}

export function setJsoncPath(source, keys, replacement) {
  if(!keys.length)throw new Error('A property path is required.');
  let node=parseJsonc(source);
  for(let k=0;k<keys.length;k++) {
    if(!node.members)throw new Error('Configuration path is not an object; merge manually.');
    const existing=node.members.find(m=>m.key===keys[k]);
    if(existing) {
      if(k===keys.length-1) return source.slice(0,existing.node.start)+JSON.stringify(replacement,null,2)+source.slice(existing.node.end);
      node=existing.node;continue;
    }
    let child=replacement;
    for(let j=keys.length-1;j>k;j--)child={[keys[j]]:child};
    const comma=node.members.length&&!node.trailing?',':'';
    const insert=comma+'\n  '+JSON.stringify(keys[k])+': '+JSON.stringify(child,null,2)+'\n';
    return source.slice(0,node.close)+insert+source.slice(node.close);
  }
}
