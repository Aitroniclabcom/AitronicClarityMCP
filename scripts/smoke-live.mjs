// Operator-only live protocol check. Credentials and temporary test tokens stay local.
import { readFileSync,writeFileSync } from 'node:fs';
import { createHash,randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const base=process.env.SMOKE_URL||'https://clarity-mcp.aitroniclab.com';
const mode=process.argv[2]||'start',stateFile='.private/smoke.json';
const {ADMIN_PASSWORD:password}=JSON.parse(readFileSync('.private/runtime.json','utf8'));
let cookie='';
const request=async(path,options={})=>{const r=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(45000),...options,headers:{Cookie:cookie,...options.headers}});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;};
const form=body=>({method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:base},body:new URLSearchParams(body)});
const json=(body,token)=>({method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
const rpc=async(method,params,token)=>{const r=await request('/mcp',json({jsonrpc:'2.0',id:1,method,params},token));assert.equal(r.status,200);return r.json();};
let r=await request('/health');assert.equal(r.status,200);assert.equal((await r.json()).status,'ok');
r=await request('/.well-known/oauth-authorization-server');const metadata=await r.json();assert.equal(metadata.issuer,base+'/');assert.equal(metadata.registration_endpoint,base+'/register');
r=await request('/mcp',json({jsonrpc:'2.0',id:1,method:'tools/list'}));assert.equal(r.status,401);
if(mode==='finish') {
  const state=JSON.parse(readFileSync(stateFile,'utf8'));
  r=await request('/token',form({grant_type:'refresh_token',client_id:state.client.client_id,refresh_token:state.tokens.refresh_token}));assert.equal(r.status,200);const refreshed=await r.json();
  const list=await rpc('tools/call',{name:'list_projects',arguments:{}},refreshed.access_token);assert.deepEqual(JSON.parse(list.result.content[0].text).map(p=>p.id).sort(),state.projects.slice().sort());
  r=await request('/revoke',form({client_id:state.client.client_id,token:refreshed.refresh_token}));assert.equal(r.status,200);
  r=await request('/mcp',json({jsonrpc:'2.0',id:2,method:'tools/list'},refreshed.access_token));assert.equal(r.status,401);
  writeFileSync(stateFile,JSON.stringify({completed:true,at:new Date().toISOString()}));
  console.log('PASS: OAuth refresh and project scope persisted; temporary test grant revoked.');
} else {
  r=await request('/register',json({client_name:'Deployment verification (temporary)',redirect_uris:['https://example.invalid/clarity-smoke'],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']}));assert.equal(r.status,201);const client=await r.json();
  const verifier=randomBytes(48).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
  r=await request('/authorize?'+new URLSearchParams({client_id:client.client_id,redirect_uri:client.redirect_uris[0],response_type:'code',code_challenge:challenge,code_challenge_method:'S256',scope:'clarity:read',resource:base+'/mcp',state:'deployment-check'}));assert.equal(r.status,302);let consent=r.headers.get('location');
  if(mode==='handoff')cookie=''; // The approval browser did not receive the initiating client's cookie.
  r=await request('/login?next='+encodeURIComponent(consent));const html=await r.text(),csrf=html.match(/name="csrf" value="([^"]+)"/)[1];
  r=await request('/login',form({password,csrf,next:consent}));assert.equal(r.status,302);
  r=await request('/admin');const admin=await r.text();assert.match(admin,/Projekti \(\d+\)/);assert.ok(!admin.includes(password));
  const projects=[...admin.matchAll(/<form method="post" action="\/admin\/projects">([\s\S]*?)<\/form>/g)].filter(m=>m[1].includes('name="enabled" checked')).map(m=>m[1].match(/name="id" value="([a-z0-9-]+)"/)?.[1]).filter(Boolean);assert.ok(projects.length>=8);
  if(mode==='handoff') {
    r=await request(consent);assert.equal(r.status,302);const restart=r.headers.get('location');assert.ok(restart.startsWith('/authorize?'));
    r=await request(restart);assert.equal(r.status,302);consent=r.headers.get('location');
    r=await request(consent);assert.equal(r.status,200);assert.match(await r.text(),/Atļaut Clarity piekļuvi/);
    r=await request('/consent?request=missing');assert.equal(r.status,410);
  }
  const body=new URLSearchParams({csrf,request:new URL(consent,base).searchParams.get('request'),decision:'approve'});projects.forEach(p=>body.append('projects',p));
  r=await request('/consent',{...form({}),body});assert.equal(r.status,302);const callback=new URL(r.headers.get('location'));assert.equal(callback.searchParams.get('state'),'deployment-check');
  r=await request('/token',form({grant_type:'authorization_code',client_id:client.client_id,code:callback.searchParams.get('code'),code_verifier:verifier,redirect_uri:client.redirect_uris[0],resource:base+'/mcp'}));assert.equal(r.status,200);const tokens=await r.json();
  const init=await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'deployment-check',version:'1.0'}},tokens.access_token);assert.equal(init.result.serverInfo.name,'aitronic-clarity');
  const tools=await rpc('tools/list',{},tokens.access_token);assert.equal(tools.result.tools.length,4);
  const list=await rpc('tools/call',{name:'list_projects',arguments:{}},tokens.access_token);const listed=JSON.parse(list.result.content[0].text);assert.deepEqual(listed.map(p=>p.id).sort(),projects.slice().sort());
  const capabilities=await rpc('tools/call',{name:'get_capabilities',arguments:{}},tokens.access_token);assert.equal(JSON.parse(capabilities.result.content[0].text).daily_requests_per_project,10);
  const unconfigured=listed.find(p=>!p.configured);
  if(unconfigured){const insights=await rpc('tools/call',{name:'get_insights',arguments:{project:unconfigured.id}},tokens.access_token);assert.equal(insights.result.isError,true);assert.match(insights.result.content[0].text,/not been configured/);}
  const history=await rpc('tools/call',{name:'get_history',arguments:{project:projects[0]}},tokens.access_token);assert.ok(Array.isArray(JSON.parse(history.result.content[0].text)));
  r=await request('/logout',form({csrf}));assert.equal(r.status,302);
  writeFileSync(stateFile,JSON.stringify({client,tokens,projects}));
  console.log('PASS: trusted HTTPS, discovery, DCR, login, '+(mode==='handoff'?'cross-browser consent recovery, missing-request recovery, ':'')+'PKCE, MCP initialize, 4 tools, '+projects.length+' authorized projects, saved history. No Clarity API requests made.');
}
