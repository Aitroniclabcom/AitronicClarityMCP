import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { timingSafeEqual, scryptSync } from 'node:crypto';
import { z } from 'zod';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AuthProvider } from './auth.js';
import { createServer } from './mcp.js';
import { random,hash } from './store.js';
import { page,login,dashboard } from './views.js';
export function createApp({store,clarity,base,password}) {
  if(!password||password.length<24) throw new Error('ADMIN_PASSWORD must contain at least 24 characters');
  const baseUrl=new URL(base);if(baseUrl.pathname!=='/'||baseUrl.search||baseUrl.hash||baseUrl.username) throw new Error('PUBLIC_URL must be an origin');
  const app=express(),provider=new AuthProvider(store,base),passwordHash=scryptSync(password,'aitronic-clarity-admin',32);
  app.disable('x-powered-by');app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'none'"],styleSrc:["'unsafe-inline'"],formAction:["'self'"],baseUri:["'none'"],frameAncestors:["'none'"]}}}));
  app.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.use(express.json({limit:'32kb'}));app.use(express.urlencoded({extended:false,limit:'32kb'}));
  const uiPaths=['/admin','/login','/logout','/authorize','/consent'];
  app.use(uiPaths,(req,res,next)=>{
    const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('clarity_session='))?.slice(16);
    let session=cookie&&store.get('session',hash(cookie));let id=cookie;
    if(!session){id=random();session={csrf:random(),authenticated:false};store.put('session',hash(id),session,8*3600);res.cookie('clarity_session',id,{httpOnly:true,secure:baseUrl.protocol==='https:',sameSite:'lax',maxAge:8*3600000,path:'/'});}
    req.session=session;req.sessionId=hash(id);next();
  });
  const csrf=(req,res,next)=>{
    const matches=req.body.csrf===req.session.csrf,originMatches=!req.headers.origin||req.headers.origin===base;
    if(!matches||!originMatches) {
      console.warn('Form validation rejected',JSON.stringify({csrfMatches:matches,originMatches,hasSessionCookie:String(req.headers.cookie||'').includes('clarity_session='),bodyCsrfType:typeof req.body.csrf}));
      return res.status(403).send(page('Pieprasījums noraidīts','<p>Atveriet <a href="/login">pieslēgšanās lapu</a> vēlreiz un mēģiniet no jauna.</p>'));
    }
    next();
  };
  const loggedIn=(req,res,next)=>{if(!req.session.authenticated)return res.redirect('/login?next='+encodeURIComponent(req.originalUrl));next();};
  const limiter=rateLimit({windowMs:15*60000,limit:10,standardHeaders:'draft-8',legacyHeaders:false});
  app.get('/health',(_req,res)=>{store.db.prepare('SELECT 1').get();res.json({status:'ok',service:'aitronic-clarity-mcp'});});
  app.get('/',(_req,res)=>res.send(page('Microsoft Clarity MCP','<section><p>Drošs vairāku projektu analītikas savienojums ar ChatGPT un Claude.</p><p>MCP adrese: <code>'+base+'/mcp</code></p><p><a href="/admin">Atvērt projektu pārvaldību</a></p></section>')));
  app.get('/login',(req,res)=>res.send(login(req.session.csrf,req.query.next)));
  app.post('/login',limiter,csrf,(req,res)=>{
    const candidate=typeof req.body.password==='string'?req.body.password:'';
    if(!timingSafeEqual(scryptSync(candidate,'aitronic-clarity-admin',32),passwordHash)) return res.status(401).send(login(req.session.csrf,req.body.next,'Nepareiza parole.'));
    req.session.authenticated=true;store.put('session',req.sessionId,req.session,8*3600);
    const next=String(req.body.next||'/admin');res.redirect(next.startsWith('/consent?')?next:'/admin');
  });
  app.post('/logout',csrf,(req,res)=>{store.remove('session',req.sessionId);res.clearCookie('clarity_session',{path:'/'});res.redirect('/login');});
  app.get('/admin',loggedIn,(req,res)=>res.send(dashboard(store,req.session.csrf,base,req.query.message)));
  const projectSchema=z.object({id:z.string().regex(/^[a-z0-9-]{1,100}$/).optional(),name:z.string().trim().min(1).max(100),domain:z.string().trim().toLowerCase().regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/),clarity_id:z.string().regex(/^[a-zA-Z0-9_-]{0,100}$/).default(''),token:z.string().trim().max(8192).default(''),enabled:z.string().optional()});
  app.post('/admin/projects',loggedIn,csrf,(req,res)=>{
    const p=projectSchema.parse(req.body);p.id=p.id||p.domain.replaceAll('.','-');p.enabled=p.enabled==='on';store.saveProject(p);
    res.redirect('/admin?message='+encodeURIComponent('Projekts saglabāts.'));
  });
  app.post('/admin/check',loggedIn,csrf,async(req,res)=>{let msg;try{const r=await clarity.insights(String(req.body.id),1,[]);msg='Savienojums darbojas. Dati: '+r.captured_at;}catch(e){msg=e.message;}res.redirect('/admin?message='+encodeURIComponent(msg));});
  app.post('/admin/revoke',loggedIn,csrf,(req,res)=>{store.remove('grant',String(req.body.id));store.audit('oauth_revoked',String(req.body.id));res.redirect('/admin');});
  app.get('/consent',loggedIn,(req,res)=>res.send(provider.consentPage(req)));
  app.post('/consent',loggedIn,csrf,(req,res)=>provider.approve(req,res));
  app.use(mcpAuthRouter({provider,issuerUrl:baseUrl,resourceServerUrl:new URL(base+'/mcp'),scopesSupported:['clarity:read'],resourceName:'Aitronic Clarity MCP',serviceDocumentationUrl:new URL(base)}));
  const auth=requireBearerAuth({verifier:provider,requiredScopes:['clarity:read'],expectedResource:base+'/mcp',resourceMetadataUrl:base+'/.well-known/oauth-protected-resource/mcp'});
  app.use('/mcp',(req,res,next)=>{if(req.headers.origin&&req.headers.origin!==base)return res.status(403).json({error:'Origin not allowed'});next();},auth,rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false}));
  app.post('/mcp',async(req,res)=>{
    const server=createServer(store,clarity,req.auth.extra.projects),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on('close',()=>{void transport.close();void server.close();});
    await server.connect(transport);await transport.handleRequest(req,res,req.body);
  });
  app.all('/mcp',(_req,res)=>res.status(405).set('Allow','POST').end());
  app.use((error,_req,res,_next)=>{const invalid=error instanceof z.ZodError;if(!invalid) console.error('Request failed:',error.name);if(!res.headersSent)res.status(invalid?400:500).send(page('Pieprasījums neizdevās',invalid?'<p>Pārbaudiet ievadītos projekta laukus.</p>':'<p>Pieprasījumu neizdevās apstrādāt. Autorizācijas laikā sāciet savienojuma pievienošanu vēlreiz.</p>'));});
  return {app,provider};
}
