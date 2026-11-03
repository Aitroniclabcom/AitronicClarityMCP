// Isolated browser fixture. No production credentials or project data are used.
import http from 'node:http';
import { createHash } from 'node:crypto';
import { Store } from '../src/store.js';
import { Clarity } from '../src/clarity.js';
import { createApp } from '../src/app.js';
const base='http://127.0.0.1:3170',callback='http://127.0.0.1:3171/oauth/callback';
const store=new Store(':memory:','a'.repeat(64));
const {app,provider}=createApp({store,clarity:new Clarity(store),base,password:'browser-fixture-password-123456789'});
const verifier='v'.repeat(64),challenge=createHash('sha256').update(verifier).digest('base64url');
const client=provider.clientsStore.registerClient({client_name:'Isolated browser callback test',redirect_uris:[callback],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']});
const query=new URLSearchParams({client_id:client.client_id,redirect_uri:callback,response_type:'code',code_challenge:challenge,code_challenge_method:'S256',scope:'clarity:read',resource:base+'/mcp',state:'browser-fixture-state'});
app.get('/fixture/start',(_req,res)=>res.redirect('/authorize?'+query));
const server=app.listen(3170,'127.0.0.1',()=>console.log('Browser fixture ready: '+base+'/fixture/start'));
const callbackServer=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:3171');
  if(url.pathname!=='/oauth/callback'){res.writeHead(404).end();return;}
  try {
    if(url.searchParams.get('state')!=='browser-fixture-state')throw new Error('State mismatch');
    const code=url.searchParams.get('code');
    if(!code)throw new Error('No authorization code');
    const r=await fetch(base+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client.client_id,grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:callback,resource:base+'/mcp'})});
    if(!r.ok)throw new Error('Token exchange failed');
    const tokens=await r.json();
    const result=await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:'Bearer '+tokens.access_token},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_projects',arguments:{}}})});
    const payload=await result.json();
    const projects=JSON.parse(payload.result.content[0].text);
    if(projects.length!==1||projects[0].id!=='rockmole-lv')throw new Error('Incorrect project scope');
    console.log('CALLBACK_AND_MCP_SUCCEEDED');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<h1>OAuth callback and scoped MCP succeeded</h1>');
  } catch {res.writeHead(500).end('Browser OAuth fixture failed');}
}).listen(3171,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();callbackServer.close();store.close();process.exit(0);});
