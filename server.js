import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const dataDir=path.join(root,'data');
const audioDir=path.join(dataDir,'audio');
fs.mkdirSync(audioDir,{recursive:true});
const dbPath=path.join(dataDir,'state.json');
const blank=()=>({room:{active:false,phase:'WAITING',test:'vocal',track:null,startedAt:0,offset:0,playing:false,countdownAt:0,candidate:null,recording:false},tracks:[],scores:{},notes:{},chat:[],members:{}});
let db=fs.existsSync(dbPath)?{...blank(),...JSON.parse(fs.readFileSync(dbPath,'utf8'))}:blank();
db.room={...blank().room,...db.room,active:false,playing:false,countdownAt:0,recording:false};
db.members={};
const secret=process.env.HOST_KEY||crypto.randomBytes(12).toString('hex');
const port=Number(process.env.PORT||3000);
const clients=new Map();
const inviteTokens=new Map();
const sessions=new Map();
const id=()=>crypto.randomBytes(12).toString('hex');
const save=()=>fs.writeFileSync(dbPath,JSON.stringify({...db,members:{}},null,2));
const send=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj))};
const broadcast=(kind,payload)=>{const msg=`data: ${JSON.stringify({kind,payload})}\n\n`;for(const [token,res] of clients){try{res.write(msg)}catch{clients.delete(token)}}};
const publicState=()=>({room:db.room,tracks:db.tracks,chat:db.chat.slice(-100),members:Object.entries(db.members).map(([token,m])=>({id:token,name:m.name,role:m.role,online:clients.has(token)}))});
const read=async(req,max=1024*1024)=>{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max)throw Error('File or request too large');chunks.push(chunk)}return Buffer.concat(chunks)};
const body=async(req)=>JSON.parse((await read(req)).toString()||'{}');
const tokenOf=req=>(req.headers.authorization||'').replace(/^Bearer /,'')||new URL(req.url,'http://localhost').searchParams.get('token');
const auth=req=>{const t=tokenOf(req);return {token:t,user:sessions.get(t)}};
const must=(req,roles)=>{const a=auth(req);if(!a.user||!roles.includes(a.user.role))throw Error('Access denied');return a};
const emit=()=>{save();broadcast('state',publicState())};
const musicPosition=()=>db.room.playing?db.room.offset+(Date.now()-db.room.startedAt)/1000:db.room.offset;
const allowed=['vocal','rap','rhythm','pitch'];
const staticTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
 try{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/api/login'&&req.method==='POST'){
  const b=await body(req);let role='candidate';
  if(b.hostKey&&b.hostKey===secret)role='host';
  else if(b.invite){const inv=inviteTokens.get(b.invite);if(!inv||inv.exp<Date.now())return send(res,403,{error:'Invite invalid or expired'});role=inv.role;if(role==='candidate'&&[...sessions.values()].some(s=>s.role==='candidate'))return send(res,409,{error:'Candidate slot occupied'});if(role==='candidate')db.room.candidate=b.invite}
  else return send(res,403,{error:'Invitation required'});
  if(role!=='host'&&!db.room.active)return send(res,403,{error:'Room is offline'});
  const token=id();const name=String(b.name||role).trim().slice(0,32)||role;
  sessions.set(token,{name,role,invite:b.invite||null});db.members[token]={name,role};emit();return send(res,200,{token,role,name});
 }
 if(u.pathname==='/api/events'&&req.method==='GET'){
  const {token,user}=auth(req);if(!user)return send(res,401,{error:'Unauthorized'});
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
  clients.set(token,res);res.write(`data: ${JSON.stringify({kind:'state',payload:publicState()})}\n\n`);
  const heartbeat=setInterval(()=>{try{res.write(': ping\n\n')}catch{}},20000);
  req.on('close',()=>{clearInterval(heartbeat);clients.delete(token);broadcast('presence',publicState().members)});broadcast('presence',publicState().members);return;
 }
 if(u.pathname==='/api/state'){must(req,['host','examiner','candidate']);return send(res,200,publicState())}
 if(u.pathname==='/api/invite'&&req.method==='POST'){
  must(req,['host']);const b=await body(req);if(!['examiner','candidate'].includes(b.role))throw Error('Invalid role');const invite=id();inviteTokens.set(invite,{role:b.role,exp:Date.now()+24*3600*1000});return send(res,200,{invite,role:b.role});
 }
 if(u.pathname==='/api/room'&&req.method==='POST'){
  must(req,['host']);const b=await body(req);
  if(b.action==='open'){db.room={...blank().room,active:true};db.scores={};db.notes={};db.chat=[];}
  else if(b.action==='close'){db.room.active=false;db.room.playing=false;db.room.phase='FINISHED';db.room.candidate=null;inviteTokens.clear()}
  else if(b.action==='reset'){for(const [t,s] of sessions)if(s.role==='candidate'){sessions.delete(t);delete db.members[t];clients.get(t)?.end();clients.delete(t)}db.room.phase='WAITING';db.room.playing=false;db.room.offset=0;db.room.candidate=null;db.scores={};db.notes={};db.chat=[];for(const [k,v] of inviteTokens)if(v.role==='candidate')inviteTokens.delete(k)}
  else if(b.action==='test'&&allowed.includes(b.test)){db.room.test=b.test;db.room.phase='PREPARING';db.room.playing=false;db.room.offset=0;db.room.countdownAt=0}
  else if(b.action==='track'){if(b.track!==null&&!db.tracks.some(t=>t.id===b.track))throw Error('Track not found');db.room.track=b.track;db.room.playing=false;db.room.offset=0;db.room.phase='PREPARING'}
  else if(b.action==='countdown'){db.room.phase='COUNTDOWN';db.room.countdownAt=Date.now()+4000;db.room.offset=0;db.room.startedAt=db.room.countdownAt;db.room.playing=!!db.room.track}
  else if(b.action==='pause'){db.room.offset=musicPosition();db.room.playing=false;db.room.phase='REVIEWING'}
  else if(b.action==='resume'){db.room.startedAt=Date.now();db.room.playing=!!db.room.track;db.room.phase='TESTING'}
  else if(b.action==='seek'){db.room.offset=Math.max(0,Number(b.offset)||0);db.room.startedAt=Date.now()}
  else if(b.action==='review'){db.room.offset=musicPosition();db.room.playing=false;db.room.phase='REVIEWING'}
  else if(b.action==='finish'){db.room.offset=musicPosition();db.room.playing=false;db.room.phase='FINISHED'}
  else throw Error('Unknown action');emit();return send(res,200,{ok:true});
 }
 if(u.pathname==='/api/chat'&&req.method==='POST'){
  const {user}=must(req,['host','examiner','candidate']);const b=await body(req);const message=String(b.message||'').trim().slice(0,500);if(!message)throw Error('Empty message');db.chat.push({id:id(),name:user.name,role:user.role,message,time:Date.now()});db.chat=db.chat.slice(-200);emit();return send(res,200,{ok:true});
 }
 if(u.pathname==='/api/score'&&req.method==='POST'){
  const {token,user}=must(req,['host','examiner']);const b=await body(req);const criteria=['pitch','rhythm','technique','expression'];if(!criteria.every(k=>Number.isFinite(b.values?.[k])&&b.values[k]>=0&&b.values[k]<=100))throw Error('Scores must be between 0 and 100');db.scores[token]={name:user.name,values:Object.fromEntries(criteria.map(k=>[k,b.values[k]])),submitted:!!b.submitted};emit();return send(res,200,{ok:true});
 }
 if(u.pathname==='/api/notes'&&req.method==='POST'){
  const {token}=must(req,['host','examiner']);const b=await body(req);db.notes[token]=String(b.text||'').slice(0,4000);save();return send(res,200,{ok:true});
 }
 if(u.pathname==='/api/review'&&req.method==='GET'){
  const {token,user}=must(req,['host','examiner']);const judges=Object.values(db.scores).filter(s=>s.submitted).map(s=>({...s,average:Object.values(s.values).reduce((a,b)=>a+b,0)/4}));const allAssigned=Object.entries(db.members).filter(([,m])=>m.role==='examiner').map(([t])=>t);if(!allAssigned.length)allAssigned.push(...Object.entries(db.members).filter(([,m])=>m.role==='host').map(([t])=>t));const complete=allAssigned.length>0&&allAssigned.every(t=>db.scores[t]?.submitted);const average=judges.length?judges.reduce((a,b)=>a+b.average,0)/judges.length:null;return send(res,200,{judges,complete,average:complete?average:null,ownScore:db.scores[token]||null,ownNotes:db.notes[token]||''});
 }
 if(u.pathname==='/api/tracks'&&req.method==='POST'){
  must(req,['host']);const name=String(req.headers['x-file-name']||'Track').slice(0,120);const ext=path.extname(name).toLowerCase();if(!['.mp3','.wav','.ogg','.m4a'].includes(ext))throw Error('Unsupported audio format');const buffer=await read(req,30*1024*1024);if(!buffer.length)throw Error('Empty file');const file=id()+ext;fs.writeFileSync(path.join(audioDir,file),buffer);const track={id:id(),name:name.replace(/[<>]/g,''),file,size:buffer.length};db.tracks.push(track);emit();return send(res,200,track);
 }
 if(u.pathname==='/api/tracks'&&req.method==='DELETE'){
  must(req,['host']);const b=await body(req);if(db.room.track===b.id)throw Error('Remove track from room first');const t=db.tracks.find(t=>t.id===b.id);if(!t)throw Error('Track not found');fs.rmSync(path.join(audioDir,t.file),{force:true});db.tracks=db.tracks.filter(x=>x.id!==b.id);emit();return send(res,200,{ok:true});
 }
 if(u.pathname.startsWith('/audio/')&&req.method==='GET'){
  must(req,['host','examiner','candidate']);const file=path.basename(u.pathname);if(!db.tracks.some(t=>t.file===file))return send(res,404,{error:'Not found'});const fp=path.join(audioDir,file);const size=fs.statSync(fp).size;const range=req.headers.range;const mime=file.endsWith('.mp3')?'audio/mpeg':file.endsWith('.wav')?'audio/wav':file.endsWith('.ogg')?'audio/ogg':'audio/mp4';if(range){const match=/bytes=(\d+)-(\d*)/.exec(range);if(match){const start=Number(match[1]);const end=Math.min(match[2]?Number(match[2]):size-1,size-1);res.writeHead(206,{'Content-Type':mime,'Content-Range':`bytes ${start}-${end}/${size}`,'Accept-Ranges':'bytes','Content-Length':end-start+1});fs.createReadStream(fp,{start,end}).pipe(res);return}}res.writeHead(200,{'Content-Type':mime,'Content-Length':size,'Accept-Ranges':'bytes'});fs.createReadStream(fp).pipe(res);return;
 }
 if(u.pathname==='/api/signal'&&req.method==='POST'){
  const {token}=must(req,['host','examiner','candidate']);const b=await body(req);if(!sessions.has(b.to))throw Error('Peer unavailable');const target=clients.get(b.to);if(target)target.write(`data: ${JSON.stringify({kind:'signal',payload:{from:token,signal:b.signal}})}\n\n`);return send(res,200,{ok:true});
 }
 if(u.pathname==='/api/logout'&&req.method==='POST'){const {token}=auth(req);sessions.delete(token);delete db.members[token];clients.get(token)?.end();clients.delete(token);emit();return send(res,200,{ok:true})}
 if(req.method!=='GET')return send(res,404,{error:'Not found'});
 const pathname=u.pathname==='/'?'/index.html':u.pathname;const fp=path.resolve(root,'.'+pathname);if(!fp.startsWith(root+path.sep)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()||fp.startsWith(dataDir))return send(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':staticTypes[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);
 }catch(e){send(res,e.message==='Access denied'?403:400,{error:e.message})}
});
server.listen(port,()=>{console.log(`RƎ:ALYZE Testing http://localhost:${port}`);if(!process.env.HOST_KEY)console.log(`Host access key: ${secret}`)});
