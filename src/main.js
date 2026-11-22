import './styles.css';
import { createStore, NOT_CONFIGURED_MESSAGE } from './store/index.js';
import qrcode from 'qrcode-generator';
import { SEATS_PER_ROW, USERNAME_RE } from './config.js';

/* ====== EDIT HERE: show date & time ====== */
const SHOW = { date: new Date('2026-12-19T19:00:00+07:00'), label: 'Sat, 19 Dec 2026 · 7:00 PM' };

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = t => new Date(t).toLocaleString('en-GB', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
function toast(t){ const el=$('#toast'); el.textContent=t; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),2400) }
function confetti(){ const cs=['#ff5c8a','#ffc93c','#2ec4a6','#3fa9f5','#8b6cf6']; for(let i=0;i<60;i++){ const c=document.createElement('i'); c.className='confetti'; c.style.left=Math.random()*100+'vw'; c.style.background=cs[i%5]; c.style.animationDelay=Math.random()*.6+'s'; c.style.borderRadius=Math.random()>.5?'50%':'2px'; document.body.appendChild(c); setTimeout(()=>c.remove(),3200) } }

/* floating notes */
(function(){ const n=['♪','♫','♬','♩','🎵','🎶']; for(let i=0;i<14;i++){ const s=document.createElement('span'); s.className='note'; s.textContent=n[i%n.length]; s.style.left=(i*7.3)%100+'vw'; s.style.animationDelay=(-i*1.3)+'s'; s.style.animationDuration=(12+i%5*3)+'s'; s.style.color=['#ff5c8a','#8b6cf6','#2ec4a6','#3fa9f5','#ffc93c'][i%5]; $('#bg').appendChild(s) } })();
/* logo fallback */
(function(){ const img=$('#logo'); const fb=()=>{ $('#logoWrap').innerHTML='<svg viewBox="0 0 80 80" width="78" height="78"><circle cx="40" cy="40" r="38" fill="#fff"/><circle cx="40" cy="40" r="33" fill="none" stroke="#1d4fa3" stroke-width="3"/><text x="40" y="38" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="17" fill="#1d4fa3">NVL</text><text x="40" y="54" text-anchor="middle" font-family="Nunito" font-weight="800" font-size="8" fill="#d6283b">HIGH SCHOOL</text></svg>' }; img.addEventListener('error',fb); if(img.complete && !img.naturalWidth) fb(); })();

/* ====== CONTENT ====== */
const EVENTS=[
 {id:'main',cat:'Concert',em:'🎤',bg:'linear-gradient(135deg,#ff5c8a,#ffc93c)',t:'Music for Change – Main Show',m:SHOW.label,v:'School Hall',book:true},
 {id:'rehearsal',cat:'Concert',em:'🎸',bg:'linear-gradient(135deg,#8b6cf6,#3fa9f5)',t:'Open Dress Rehearsal',m:'The day before the show · 4:00 PM',v:'School Hall',book:true},
 {id:'museum',cat:'Exhibition',em:'🎻',bg:'linear-gradient(135deg,#2ec4a6,#3fa9f5)',t:'Musical Museum Exhibition',m:'Show night · from 6:00 PM',v:'Hall lobby',go:'museum'},
 {id:'donate',cat:'Charity',em:'🎁',bg:'linear-gradient(135deg,#ffc93c,#ff8a5c)',t:'Donation Desk: Books & Clothes',m:'Show night · from 6:30 PM',v:'Hall entrance',go:'merch'},
 {id:'workshop',cat:'Workshop',em:'🥁',bg:'linear-gradient(135deg,#ff8a5c,#8b6cf6)',t:'Rhythm Workshop for Guests',m:'Show night · 6:15 PM',v:'Hall lobby',go:'museum'}
];
const BOOKABLE=EVENTS.filter(e=>e.book);
const TYPES=[
 {id:'A',name:'Zone A · Front rows',desc:'Closest to the stage. Seated.',em:'⭐',bgc:'#ffe3ec',zc:'#ff5c8a',rows:['A','B','C'],seated:true},
 {id:'B',name:'Zone B · Middle rows',desc:'Great view of the whole stage. Seated.',em:'🎵',bgc:'#e0f3ff',zc:'#3fa9f5',rows:['D','E','F'],seated:true},
 {id:'F',name:'Family & Teachers',desc:'Reserved rows for parents and teachers. Seated.',em:'💐',bgc:'#dcfbf2',zc:'#2ec4a6',rows:['G','H'],seated:true},
 {id:'S',name:'Fan Zone · Standing',desc:'Dance and sing along at the side of the hall.',em:'🙌',bgc:'#fff1c9',zc:'#ffc93c',seated:false}
];
const seatCount=t=>t.seated?t.rows.length*SEATS_PER_ROW:Infinity;
const PLEDGES=['📚 Books','👕 Clothes','✏️ School supplies','🧸 Toys','🙂 Just coming to cheer'];
const ACTS=[
 {id:1,name:'The Harmonies',group:'Group 1',genre:'Acoustic Pop',g:'linear-gradient(135deg,#ff5c8a,#ff8a5c)',desc:'Guitars, cajón and warm vocals — gentle songs about friendship and kindness.',songs:[['Opening: acoustic medley','6\''],['English pop cover','4\'']]},
 {id:2,name:'Rhythm Rangers',group:'Group 2',genre:'Folk Remix',g:'linear-gradient(135deg,#2ec4a6,#3fa9f5)',desc:'Vietnamese folk melodies meet modern beats, with a short English rap about our community.',songs:[['Folk song remix','5\''],['Original rap: "Hands Together"','3\'']]},
 {id:3,name:'Sound Waves',group:'Group 3',genre:'Live Band',g:'linear-gradient(135deg,#8b6cf6,#3fa9f5)',desc:'Drums, keyboard and electric guitar. The loudest and most energetic act of the night!',songs:[['Rock anthem cover','4\''],['Band jam & audience sing-along','5\'']]},
 {id:4,name:'Melody Makers',group:'Group 4',genre:'Choir & Musical',g:'linear-gradient(135deg,#ffc93c,#ff8a5c)',desc:'A class choir with a short musical scene telling the story of "Music for Change".',songs:[['Musical scene','6\''],['Finale: all of 10C9','5\'']]}
];
const RUN=[['19:00','Welcome & MC opening','#ff5c8a'],['19:10','The Harmonies','#ff5c8a'],['19:22','Rhythm Rangers','#2ec4a6'],['19:34','Musical Museum quiz break','#ffc93c'],['19:45','Sound Waves','#8b6cf6'],['19:57','Melody Makers','#ff8a5c'],['20:10','Finale & donation thank-you','#3fa9f5']];
const ERAS=[
 ['Ancient times','Early music','#ff8a5c','People made music with drums, flutes and voices for rituals, work and celebrations.'],
 ['1600–1750','Baroque','#ff5c8a','Rich, decorated music. Bach and Vivaldi are famous composers from this era.'],
 ['1750–1820','Classical','#8b6cf6','Clear, balanced melodies. Think of Mozart and the young Beethoven.'],
 ['1900s–1920s','Jazz & Blues','#3fa9f5','Born in African-American communities in the USA, full of rhythm and improvisation.'],
 ['1950s','Rock \'n\' roll','#2ec4a6','Electric guitars, strong beats and dancing teenagers changed popular music forever.'],
 ['1980s–','Pop & Hip-hop','#ffc93c','Music videos, catchy choruses and rap made music a global culture.'],
 ['2000s–today','Digital era','#ff5c8a','Streaming, talent shows and K-pop / V-pop let songs travel the world in seconds.']
];
const INST=[
 {n:'Đàn bầu',o:'Vietnam',d:'A one-string instrument. Players bend the pitch with a flexible rod, making a soft "singing" sound.',f:[392,440,392,349],w:'sine',svg:'<rect x="15" y="60" width="130" height="22" rx="10" fill="#c98a4b"/><circle cx="30" cy="54" r="12" fill="#e7b46a"/><line x1="30" y1="40" x2="40" y2="20" stroke="#6b4423" stroke-width="4"/><line x1="40" y1="62" x2="140" y2="62" stroke="#333" stroke-width="1.5"/>'},
 {n:'Đàn tranh',o:'Vietnam',d:'A zither with 16+ strings, plucked to make bright, flowing melodies.',f:[523,587,659,784,880],w:'triangle',svg:'<path d="M10 75 L150 55 L150 75 L10 95Z" fill="#b5651d"/>'+Array.from({length:8},(_,i)=>`<line x1="${20+i*2}" y1="${78-i*2}" x2="145" y2="${60+i*1.5}" stroke="#fff" stroke-width="1"/>`).join('')},
 {n:'Đàn t\'rưng',o:'Central Highlands, Vietnam',d:'A bamboo xylophone. Each tube makes a different note when struck.',f:[330,392,440,523,587],w:'square',svg:Array.from({length:7},(_,i)=>`<rect x="${20+i*18}" y="${30+i*5}" width="12" height="${70-i*6}" rx="5" fill="${i%2?'#9cc96b':'#7bb04a'}"/>`).join('')},
 {n:'Guitar',o:'Spain',d:'Six strings, plucked or strummed. Perfect for acoustic songs like Group 1\'s.',f:[330,247,196,147],w:'triangle',svg:'<circle cx="55" cy="70" r="28" fill="#ff8a5c"/><circle cx="85" cy="62" r="20" fill="#ff8a5c"/><circle cx="62" cy="68" r="8" fill="#2b2350"/><rect x="95" y="55" width="55" height="9" fill="#6b4423"/>'},
 {n:'Violin',o:'Italy',d:'A bowed string instrument with a high, expressive voice.',f:[659,784,659,587],w:'sawtooth',svg:'<ellipse cx="80" cy="60" rx="22" ry="34" fill="#a0522d"/><rect x="77" y="5" width="6" height="30" fill="#3b2412"/><line x1="40" y1="100" x2="125" y2="20" stroke="#ddd" stroke-width="3"/>'},
 {n:'Drum kit',o:'USA',d:'Bass drum, snare and cymbals keep the beat for bands like Sound Waves.',f:[80,80,160,80],w:'sine',drum:true,svg:'<circle cx="80" cy="75" r="30" fill="#8b6cf6"/><circle cx="80" cy="75" r="18" fill="#fff" opacity=".3"/><ellipse cx="35" cy="40" rx="22" ry="5" fill="#ffc93c"/><ellipse cx="125" cy="45" rx="22" ry="5" fill="#ffc93c"/>'}
];
const QUIZ=[
 ['Which instrument has only ONE string?',['Đàn tranh','Đàn bầu','Violin','Guitar'],1],
 ['Jazz was born in which country?',['The USA','Italy','Vietnam','Spain'],0],
 ['A group of people singing together is called a…',['band','choir','orchestra','solo'],1],
 ['Đàn t\'rưng is made mainly of…',['metal','bamboo','plastic','glass'],1],
 ['What is the theme of our concert?',['Music for Fun','Music for Change','Music for Money','Music for Sport'],1]
];
const MERCH=[
 {n:'Concert T-shirt',c:'Wear',stock:50,bgc:'#ffe3ec',d:'Cotton tee with the "Music for Change" logo, designed by 10C9.',sw:['#ff5c8a','#2b2350','#ffffff'],svg:c=>`<path d="M45 30 L70 20 Q80 32 90 20 L115 30 L135 55 L115 65 L115 125 L45 125 L45 65 L25 55Z" fill="${c}" stroke="#2b2350" stroke-width="2"/><text x="80" y="82" text-anchor="middle" font-family="Fredoka" font-size="13" fill="${c==='#2b2350'?'#ffc93c':'#2b2350'}">10C9 ♪</text>`},
 {n:'Light stick',c:'Fan gear',stock:80,bgc:'#e0f3ff',d:'Wave it during the finale! Hand-decorated by Group 3.',sw:['#3fa9f5','#8b6cf6','#ffc93c'],svg:c=>`<rect x="72" y="70" width="16" height="60" rx="6" fill="#2b2350"/><circle cx="80" cy="50" r="30" fill="${c}" opacity=".9"/><circle cx="80" cy="50" r="40" fill="${c}" opacity=".2"/><text x="80" y="57" text-anchor="middle" font-size="20">♪</text>`},
 {n:'Sticker set',c:'Paper',stock:100,bgc:'#fff1c9',d:'Six cute music stickers drawn by Group 2.',sw:['#ffc93c','#2ec4a6'],svg:c=>`<rect x="35" y="25" width="90" height="100" rx="12" fill="#fff" stroke="#2b2350" stroke-width="2"/><circle cx="60" cy="52" r="14" fill="${c}"/><circle cx="100" cy="52" r="14" fill="#ff5c8a"/><circle cx="60" cy="96" r="14" fill="#8b6cf6"/><circle cx="100" cy="96" r="14" fill="${c}"/>`},
 {n:'Tote bag',c:'Wear',stock:40,bgc:'#dcfbf2',d:'Recycled-fabric tote — perfect for carrying your donated books!',sw:['#2ec4a6','#fffaf2'],svg:c=>`<path d="M60 45 Q60 20 80 20 Q100 20 100 45" fill="none" stroke="#2b2350" stroke-width="5"/><rect x="40" y="45" width="80" height="85" rx="8" fill="${c}" stroke="#2b2350" stroke-width="2"/><text x="80" y="95" text-anchor="middle" font-family="Fredoka" font-size="12" fill="#2b2350">Music for</text><text x="80" y="110" text-anchor="middle" font-family="Fredoka" font-size="12" fill="#2b2350">Change</text>`},
 {n:'Name badge',c:'Fan gear',stock:60,bgc:'#f1ebff',d:'A round pin badge with your favourite group\'s name.',sw:['#8b6cf6','#ff5c8a','#3fa9f5'],svg:c=>`<circle cx="80" cy="75" r="45" fill="${c}" stroke="#2b2350" stroke-width="3"/><circle cx="80" cy="75" r="34" fill="#fff" opacity=".3"/><text x="80" y="82" text-anchor="middle" font-family="Fredoka" font-size="18" fill="#fff">10C9</text>`},
 {n:'Bookmark',c:'Paper',stock:120,bgc:'#ffe9de',d:'A music-note bookmark — a little gift for every book donor.',sw:['#ff8a5c','#2ec4a6'],svg:c=>`<rect x="62" y="15" width="36" height="115" rx="6" fill="${c}" stroke="#2b2350" stroke-width="2"/><circle cx="80" cy="30" r="5" fill="#fff"/><text x="80" y="85" text-anchor="middle" font-size="26" fill="#fff">♫</text>`}
];

/* ====== DATA (Supabase in production, browser storage in demo mode) ====== */
let store=null;
const me=()=>store?store.me():null;
const isAdmin=()=>me()?.role==='admin';
const cap=(ev,t)=>store?store.cap(ev,t):0;
const issued=(ev,t)=>store?store.issued(ev,t):0;
const left=(ev,t)=>Math.max(0,cap(ev,t)-issued(ev,t));
const takenSeats=ev=>store?store.taken(ev):new Set();
const merchInv=n=>store?store.merch(n):{stock:0,given:0};
const merchLeft=n=>Math.max(0,merchInv(n).stock-merchInv(n).given);
const myTickets=()=>store?store.myTickets():[];
const userName=id=>store.users().find(u=>u.id===id)?.u||'deleted user';
let busy=false;
async function run(fn){ if(busy) return; busy=true; document.body.style.cursor='progress';
  try{ return await fn() }catch(err){ toast(err.message||'Something went wrong'); try{ await store.refresh() }catch(e){} renderAll() }
  finally{ busy=false; document.body.style.cursor='' } }

/* ====== AUTH UI ====== */
let afterLogin=null;
function openAuth(mode='login',then=null){ afterLogin=then; setAuthMode(mode); $('#authModal').classList.add('show'); setTimeout(()=>{ const f=$(`#authModal form[data-mode="${mode}"] input`); f&&f.focus() },50) }
function setAuthMode(m){ $('#authTabs').hidden=m==='password'; $$('#authTabs button').forEach(b=>b.classList.toggle('on',b.dataset.m===m)); $$('#authModal form').forEach(f=>f.hidden=f.dataset.mode!==m); $$('#authModal .err').forEach(e=>e.textContent='') }
function closeModal(id){ $(id).classList.remove('show') }
function loggedIn(u,msg){ closeModal('#authModal'); toast(msg); renderAll(); const f=afterLogin; afterLogin=null; if(f) f() }
const formBusy=(f,on)=>{ const b=f.querySelector('button[type=submit]'); if(b) b.disabled=on };
$('#loginForm').onsubmit=async e=>{ e.preventDefault(); const f=e.target, un=$('#lUser').value.trim().toLowerCase(), pw=$('#lPass').value; $('#lErr').textContent=''; formBusy(f,true);
  try{ const u=await store.login(un,pw); $('#lPass').value=''; loggedIn(u,'👋 Welcome back, '+u.name+'!') }catch(err){ $('#lErr').textContent=err.message } finally{ formBusy(f,false) } };
$('#signupForm').onsubmit=async e=>{ e.preventDefault(); const f=e.target, name=$('#sName').value.trim(), cls=$('#sCls').value.trim(), un=$('#sUser').value.trim().toLowerCase(), pw=$('#sPass').value, pw2=$('#sPass2').value, err=$('#sErr'); err.textContent='';
  if(!name) return err.textContent='Please enter your full name.';
  if(!USERNAME_RE.test(un)) return err.textContent='Username: 3–20 characters, letters a-z, numbers, dot or underscore.';
  if(pw.length<6) return err.textContent='Password must be at least 6 characters.';
  if(pw!==pw2) return err.textContent='Passwords do not match.';
  formBusy(f,true);
  try{ const u=await store.signup({u:un,name,cls,pw}); f.reset(); confetti(); loggedIn(u,'🎉 Account created. Welcome, '+name+'!') }catch(x){ err.textContent=x.message } finally{ formBusy(f,false) } };
$('#pwForm').onsubmit=async e=>{ e.preventDefault(); const f=e.target, err=$('#pErr'); err.textContent=''; if(!me()) return;
  if($('#pNew').value.length<6) return err.textContent='New password must be at least 6 characters.';
  if($('#pNew').value!==$('#pNew2').value) return err.textContent='Passwords do not match.';
  formBusy(f,true);
  try{ await store.changePassword($('#pOld').value,$('#pNew').value); f.reset(); closeModal('#authModal'); toast('🔑 Password updated') }catch(x){ err.textContent=x.message } finally{ formBusy(f,false) } };
async function logout(){ await run(async()=>{ await store.logout(); toast('You have logged out'); if(location.hash==='#admin') go('home'); renderAll() }) }
function requireLogin(then,why){ if(me()) return true; toast(why||'Please sign in first'); openAuth('login',then); return false }

function renderHeader(){ const u=me();
  $('#authArea').innerHTML=u?`<button class="mytix" data-act="tix">🎟️ <span class="un">My Tickets</span> <span class="count">${myTickets().filter(t=>t.status!=='cancelled').length}</span></button>
   <div class="userchip"><button data-act="umenu"><span class="av">${esc((u.name||'?')[0].toUpperCase())}</span><span class="un">${esc(u.name)}</span><span class="role ${u.role}">${u.role==='admin'?'Admin':'User'}</span></button>
   <div class="umenu" id="uMenu"><div class="who">Signed in as <b>@${esc(u.u)}</b><br>${esc(u.cls)||''}</div>
   <button data-act="tix">🎟️ My Tickets</button>${u.role==='admin'?'<button data-go="admin">🛠️ Admin Dashboard</button>':''}<button data-act="chpw">🔑 Change password</button><button data-act="logout">🚪 Log out</button></div></div>`
   :`<button class="btn ghost sm" data-act="signup">Sign up</button><button class="btn primary sm" data-act="login">Log in</button>`;
  $('#adminTab').hidden=!isAdmin() }

/* ====== ROUTER & CLICK DELEGATION ====== */
const VIEWS=['home','ticketbox','performance','museum','merch','contact','admin'];
function go(v){ if(!VIEWS.includes(v)) v='home';
  if(v==='admin'&&!isAdmin()){ if(!me()) openAuth('login',()=>isAdmin()&&go('admin')); else toast('Admins only'); v='home' }
  $$('.view').forEach(x=>x.classList.toggle('active',x.id===v)); $$('#nav .tab').forEach(t=>t.classList.toggle('active',t.dataset.go===v));
  if(location.hash!=='#'+v) history.replaceState(null,'','#'+v); if(v==='admin') renderAdmin(); window.scrollTo({top:0,behavior:'smooth'}) }
addEventListener('hashchange',()=>go(location.hash.slice(1)));

document.addEventListener('click',e=>{
  if(!e.target.closest('.userchip')) $('#uMenu')?.classList.remove('show');
  if(!e.target.closest('.search')) $('#results').classList.remove('show');
  const m=e.target.closest('.modal'); if(m&&(e.target===m||e.target.closest('[data-close]'))) m.classList.remove('show');
  const g=e.target.closest('[data-go]'); if(g){ go(g.dataset.go); if(g.dataset.ev) pickEvent(g.dataset.ev) }
  const a=e.target.closest('[data-act]'); if(!a) return;
  if(a.dataset.confirm&&!a.dataset.armed){ a.dataset.armed=1; a.dataset.txt=a.innerHTML; a.innerHTML=a.dataset.confirm; setTimeout(()=>{ if(a.isConnected){ delete a.dataset.armed; a.innerHTML=a.dataset.txt } },3000); return }
  ACT[a.dataset.act]?.(a.dataset,a,e) });
document.addEventListener('change',e=>{ const c=e.target.closest('[data-chg]'); if(c) CHG[c.dataset.chg]?.(c) });

const ACT={
  login:()=>openAuth('login'), signup:()=>openAuth('signup'), authmode:d=>setAuthMode(d.m), logout,
  chpw:()=>openAuth('password'), umenu:()=>$('#uMenu').classList.toggle('show'), tix:()=>openTix(),
  cancelmine:d=>run(async()=>{ await store.setTicketStatus(d.code,'cancelled'); toast('Ticket cancelled'); renderAll(); openTix() }),
  vote:d=>{ if(!requireLogin(null,'Sign in to vote')) return; run(async()=>{ const added=await store.toggleVote(+d.v); if(added) toast('♥ Voted for '+ACTS.find(a=>a.id==d.v).name); renderPerf() }) },
  wish:d=>{ if(!requireLogin(null,'Sign in to use your wishlist')) return; run(async()=>{ await store.toggleWish(d.w); renderMerch() }) },
  swatch:d=>{ msel[d.m]=d.s; renderMerch() },
  /* admin */
  admtab:d=>{ adm.tab=d.t; renderAdmin() },
  lock:d=>run(async()=>{ const u=store.users().find(x=>x.id===d.u); if(!u) return; await store.setActive(u.id,!u.active); toast(u.active?'Account locked':'Account unlocked'); renderAdmin() }),
  resetpw:d=>run(async()=>{ const u=store.users().find(x=>x.id===d.u); if(!u) return; const pw=await store.resetPassword(u.id); adm.note=`Temporary password for @${u.u}: ${pw} — share it with them and ask them to change it.`; renderAdmin() }),
  deluser:d=>run(async()=>{ await store.deleteUser(d.u); toast('User deleted'); renderAll() }),
  adduser:()=>run(async()=>{ const name=$('#auName').value.trim(), un=$('#auUser').value.trim().toLowerCase(), pw=$('#auPass').value, role=$('#auRole').value, cls=$('#auCls').value.trim();
    if(!name||!USERNAME_RE.test(un)||pw.length<6) return toast('Check name, username (3–20) and password (min 6)');
    await store.addUser({u:un,name,cls,pw,role}); toast('User added'); renderAdmin() }),
  savecap:()=>run(async()=>{ const caps={}; TYPES.forEach(t=>{ caps[t.id]=Math.floor(+$(`#cap-${t.id}`).value) });
    const errs=await store.saveCapacities(adm.ev,caps);
    toast(errs.length?'Allowed range → '+errs.map(x=>`${TYPES.find(t=>t.id===x.type)?.name||x.type}: ${x.min}–${x.max}`).join('; '):'✅ Ticket quantities updated'); renderAll() }),
  tkstatus:d=>run(async()=>{ await store.setTicketStatus(d.code,d.s); renderAll() }),
  qdetail:d=>{ adm.open[d.i]=!adm.open[d.i]; renderAdmin() },
  give:d=>run(async()=>{ await store.giveMerch(d.n,+d.d); renderAll() }),
  givewish:d=>run(async()=>{ await store.giveMerch(d.n,1,d.u); toast(`🎁 ${d.n} given to @${userName(d.u)}`); renderAll() }),
  savestock:()=>run(async()=>{ const map={}; MERCH.forEach((m,i)=>{ map[m.n]=Math.floor(+$(`#stk-${i}`).value) });
    const errs=await store.saveStock(map);
    toast(errs.length?'Stock must be at least the number given: '+errs.map(x=>`${x.item} ≥ ${x.min}`).join('; '):'✅ Merchandise stock updated'); renderAll() }),
  resetdemo:()=>run(async()=>{ await store.resetEvent(); toast('All event data reset (admin accounts kept)'); renderAll() })
};
const CHG={
  setrole:c=>run(async()=>{ const u=store.users().find(x=>x.id===c.dataset.u); if(!u) return; try{ await store.setRole(u.id,c.value); toast(`@${u.u} is now ${c.value==='admin'?'an Admin':'a User'}`) } finally{ renderAdmin() } }),
  admev:c=>{ adm.ev=c.value; renderAdmin() },
  admq:c=>{ adm.q=c.value; renderAdmin() }
};

/* ====== HERO & COUNTDOWN ====== */
let si=0; const slides=$$('.slide');
slides.forEach((_,i)=>{ const b=document.createElement('button'); b.onclick=()=>show(i); $('#dots').appendChild(b) });
function show(i){ si=i; slides.forEach((s,j)=>s.classList.toggle('on',j===i)); $$('#dots button').forEach((b,j)=>b.classList.toggle('on',j===i)) }
show(0); setInterval(()=>show((si+1)%slides.length),5500);
$('#evDate').textContent='🎉 '+SHOW.label;
function tick(){ const d=Math.max(0,SHOW.date-new Date()); $('#cdD').textContent=Math.floor(d/864e5); $('#cdH').textContent=Math.floor(d/36e5)%24; $('#cdM').textContent=Math.floor(d/6e4)%60; $('#cdS').textContent=Math.floor(d/1e3)%60 }
tick(); setInterval(tick,1000);

/* ====== EVENTS ====== */
let ecat='All';
function renderCats(){ $('#cats').innerHTML=['All','Concert','Exhibition','Charity','Workshop'].map(c=>`<button class="cat ${c===ecat?'on':''}" data-c="${c}">${c}</button>`).join(''); $$('#cats .cat').forEach(b=>b.onclick=()=>{ecat=b.dataset.c;renderCats();renderEvents()}) }
function renderEvents(){ $('#events').innerHTML=EVENTS.filter(e=>ecat==='All'||e.cat===ecat).map(e=>{ const rem=e.book?TYPES.reduce((a,t)=>a+left(e.id,t.id),0):null; return `
  <div class="ecard" data-go="${e.book?'ticketbox':e.go}" ${e.book?`data-ev="${e.id}"`:''}>
   <div class="thumb" style="background:${e.bg}"><span class="tag">${e.cat}</span>${e.em}</div>
   <div class="body"><h4>${e.t}</h4><div class="meta">📅 ${e.m}</div><div class="meta">📍 ${e.v}</div>${e.book?`<div class="meta">🎫 ${rem} free tickets left</div>`:''}<div class="price">${e.book?(rem?'Free · Reserve now →':'Fully booked'):'Free entry · Learn more →'}</div></div>
  </div>` }).join('') }
renderCats();

/* ====== TICKETBOX ====== */
const newTB=()=>({ev:'main',step:0,type:null,qty:1,seats:[],phone:'',pledge:[]});
let tb=newTB();
function pickEvent(id){ tb={...newTB(),ev:id}; renderTB() }
const evInfo=()=>EVENTS.find(e=>e.id===tb.ev);
function renderTB(){
  $$('#steps .step').forEach((s,i)=>s.classList.toggle('on',i<=tb.step));
  const body=$('#stepBody'), act=$('#stepActions'), T=TYPES.find(t=>t.id===tb.type), u=me();
  if(tb.type&&left(tb.ev,tb.type)<1&&tb.step<3){ tb.type=null; tb.step=0 }
  if(tb.step===0){
    body.innerHTML=`<div class="field"><label>Event</label><select id="evSel">${BOOKABLE.map(e=>`<option value="${e.id}" ${e.id===tb.ev?'selected':''}>${e.t}</option>`).join('')}</select></div>`+
    TYPES.map(t=>{ const l=left(tb.ev,t.id); return `<div class="ttype ${tb.type===t.id?'sel':''} ${l?'':'out'}" data-t="${t.id}" style="--bgc:${t.bgc}"><div class="em">${t.em}</div><div><h4>${t.name}</h4><p>${t.desc}</p><span class="left ${l<10?'low':''}">${l?l+' left':'Sold out'}</span></div><div class="free">0 VND<div class="qty">${tb.type===t.id?`<button data-q="-1">−</button><span>${tb.qty}</span><button data-q="1">+</button>`:'<span style="color:var(--ink2);font-size:12px">Select</span>'}</div></div></div>` }).join('')+
    (u?'':`<div class="lock-card">🔒 <b>Sign in to reserve.</b> You can look around first — we'll ask you to log in when you continue.</div>`);
    $('#evSel').onchange=e=>{tb.ev=e.target.value;tb.seats=[];tb.type=null;renderTB()};
    $$('.ttype').forEach(el=>el.onclick=e=>{ const q=e.target.dataset.q; if(q){ tb.qty=Math.min(4,left(tb.ev,tb.type),Math.max(1,tb.qty+ +q)); tb.seats=[] } else if(tb.type!==el.dataset.t){ tb.type=el.dataset.t; tb.qty=1; tb.seats=[] } renderTB() });
    act.innerHTML=`<span style="font-size:13px;color:var(--ink2)">Max 4 tickets per booking</span><button class="btn primary" id="nx" ${tb.type?'':'disabled'}>Continue →</button>`;
  }
  if(tb.step===1){
    if(!T.seated) body.innerHTML=`<div class="empty"><div style="font-size:60px">🙌</div><h3 style="font-family:Fredoka">Fan Zone is standing only</h3><p>No seat to choose — just come early and find a good spot!</p></div>`;
    else{ const tk=takenSeats(tb.ev); let html='<div class="stage">STAGE</div><div class="seatmap">';
      TYPES.filter(t=>t.seated).forEach(z=>{ let k=0; const c=cap(tb.ev,z.id); z.rows.forEach(r=>{ html+=`<div class="row"><label>${r}</label>`; for(let n=1;n<=SEATS_PER_ROW;n++){ if(n===7) html+='<span class="gap"></span>'; const id=r+n, taken=tk.has(id)||k>=c, mine=tb.seats.includes(id), dim=z.id!==T.id; k++; html+=`<button class="seat ${taken?'taken':''} ${mine?'mine':''} ${dim?'dim':''}" style="--zc:${z.zc}" data-s="${id}" title="${id}">${n}</button>` } html+='</div>' }) });
      html+=`</div><div class="legend"><span><i style="background:${T.zc}"></i>Available</span><span><i style="background:var(--ink)"></i>Your seat</span><span><i style="background:#d8d3e8"></i>Reserved / closed</span></div><p style="text-align:center;margin-top:10px;font-weight:700">Choose ${tb.qty} seat(s): ${tb.seats.join(', ')||'—'}</p>`;
      body.innerHTML=html;
      $$('.seat').forEach(s=>s.onclick=()=>{ const id=s.dataset.s; if(tb.seats.includes(id)) tb.seats=tb.seats.filter(x=>x!==id); else if(tb.seats.length<tb.qty) tb.seats.push(id); else { tb.seats.shift(); tb.seats.push(id) } renderTB() }) }
    act.innerHTML=`<button class="btn ghost" id="bk">← Back</button><button class="btn primary" id="nx" ${(!T.seated||tb.seats.length===tb.qty)?'':'disabled'}>Continue →</button>`;
  }
  if(tb.step===2){
    body.innerHTML=`<div class="two"><div class="field"><label>Full name</label><input value="${esc(u.name)}" disabled></div><div class="field"><label>Class / role</label><input value="${esc(u.cls)||'—'}" disabled></div></div>
     <div class="field"><label>Phone or email (optional)</label><input id="fPh" value="${esc(tb.phone)}"></div>
     <div class="field"><label>I'd like to bring… (donation pledge)</label><div class="pledges">${PLEDGES.map(p=>`<button class="pledge ${tb.pledge.includes(p)?'on':''}" data-p="${p}">${p}</button>`).join('')}</div></div>
     <div class="note-box">💛 Your ticket is free. A pledge is optional and simply helps the donation team plan.</div>`;
    $('#fPh').oninput=e=>tb.phone=e.target.value;
    $$('.pledge').forEach(b=>b.onclick=()=>{ const p=b.dataset.p; tb.pledge=tb.pledge.includes(p)?tb.pledge.filter(x=>x!==p):[...tb.pledge,p]; b.classList.toggle('on'); renderSummary() });
    act.innerHTML=`<button class="btn ghost" id="bk">← Back</button><button class="btn primary" id="nx">Confirm booking 🎉</button>`;
  }
  if(tb.step===3){
    body.innerHTML=ticketHTML(tb.last)+`<p style="text-align:center;margin-top:16px;color:var(--ink2);font-size:14px">Saved to <b>My Tickets</b>. Show the code at the entrance.</p>`;
    act.innerHTML=`<button class="btn ghost" id="again">Book another</button><button class="btn primary" data-act="tix">Open My Tickets</button>`;
    $('#again').onclick=()=>{ tb=newTB(); renderTB() };
  }
  const nx=$('#nx'), bk=$('#bk');
  if(bk) bk.onclick=()=>{ tb.step--; renderTB() };
  if(nx) nx.onclick=()=>{ if(!me()){ requireLogin(()=>{ tb.step=1; renderTB() },'Please log in or sign up to reserve'); return } if(tb.step===2) book(); else tb.step++; renderTB() };
  renderSummary();
}
function renderSummary(){ const T=TYPES.find(t=>t.id===tb.type), E=evInfo();
  $('#summary').innerHTML=`<h4>🧾 Booking summary</h4>
  <div class="line"><span>Event</span><b style="text-align:right">${E.t}</b></div>
  <div class="line"><span>When</span><b style="text-align:right">${E.m}</b></div>
  <div class="line"><span>Ticket</span><b>${T?T.name:'—'}</b></div>
  <div class="line"><span>Quantity</span><b>${T?tb.qty:'—'}</b></div>
  <div class="line"><span>Seats</span><b>${T&&!T.seated?'Standing':(tb.seats.join(', ')||'—')}</b></div>
  <div class="line"><span>Pledge</span><b style="text-align:right">${tb.pledge.join(', ')||'—'}</b></div>
  <div class="line" style="border:none"><span>Total</span><span class="total">0 VND</span></div>
  <div class="note-box">🎁 No payment needed. Donations are collected at the desk on show night.</div>` }
async function book(){ const T=TYPES.find(t=>t.id===tb.type), E=evInfo();
  await run(async()=>{
    try{ tb.last=await store.book({ev:E.id,evTitle:E.t,evWhen:E.m,type:T.id,typeName:T.name,qty:tb.qty,seats:T.seated?[...tb.seats]:[],phone:tb.phone,pledge:tb.pledge.join(', ')}) }
    catch(err){ if(/seat/i.test(err.message)){ tb.seats=[]; tb.step=1 } else if(/left|sold/i.test(err.message)) tb.step=0; throw err }
    tb.step=3; confetti(); toast('🎉 Ticket reserved!'); renderAll() }) }
// Real, scannable QR code (error correction level M) that encodes the ticket code, e.g. "10C9-AB12-XYZ"
function qr(code){ const q=qrcode(0,'M'); q.addData(String(code)); q.make();
  return `<div style="width:130px;height:130px;background:#fff" role="img" aria-label="QR code for ticket ${esc(code)}">${q.createSvgTag({cellSize:4,margin:2,scalable:true})}</div>` }
const ST={active:'Active',checked:'Checked in',cancelled:'Cancelled'};
function ticketHTML(t,withActions){ return `<div class="eticket" style="${t.status==='cancelled'?'opacity:.55':''}"><div class="l"><span class="chip">E-TICKET · FREE</span><h3>${esc(t.ev)}</h3><div class="kv"><div>Guest<b>${esc(t.name)}</b></div><div>Class / role<b>${esc(t.cls)||'—'}</b></div><div>When<b>${esc(t.when)}</b></div><div>Ticket<b>${esc(t.type)}</b></div><div>Seat(s)<b>${esc(t.seats)}</b></div><div>Qty<b>${t.qty}</b></div></div>${t.pledge?`<p style="margin-top:12px;font-size:13px">🎁 Pledge: ${esc(t.pledge)}</p>`:''}</div><div class="r">${qr(t.code)}<span>${t.code}</span><span class="status st-${t.status}">${ST[t.status]}</span>${withActions&&t.status==='active'?`<button class="btn danger xs" data-act="cancelmine" data-code="${t.code}" data-confirm="Tap again to cancel">Cancel ticket</button>`:''}</div></div>` }
function openTix(){ if(!requireLogin(openTix,'Sign in to see your tickets')) return; const l=myTickets();
  $('#tixList').innerHTML=l.length?l.map(t=>ticketHTML(t,true)).join('<div style="height:16px"></div>'):`<div class="empty"><div style="font-size:52px">🎫</div><p>No tickets yet.</p><button class="btn primary" style="margin-top:12px" data-go="ticketbox" data-close>Reserve a free ticket</button></div>`;
  $('#uMenu')?.classList.remove('show'); $('#tixModal').classList.add('show') }

/* ====== PERFORMANCE ====== */
let genre='All';
function renderPerf(){ const u=me()?.id;
  $('#genres').innerHTML=['All',...ACTS.map(a=>a.genre)].map(g=>`<button class="cat ${g===genre?'on':''}" data-g="${g}">${g}</button>`).join(''); $$('#genres .cat').forEach(b=>b.onclick=()=>{genre=b.dataset.g;renderPerf()});
  $('#lineup').innerHTML=ACTS.filter(a=>genre==='All'||a.genre===genre).map(a=>{ const l=store?store.votes(a.id):[]; return `<div class="act" id="act-${a.id}"><div class="head" style="--g:${a.g}"><span class="num">0${a.id}</span><small>${a.group} · ${a.genre}</small><h4>${a.name}</h4></div><div class="b"><p>${a.desc}</p><ul class="songs">${a.songs.map(s=>`<li><span>🎵 ${s[0]}</span><b>${s[1]}</b></li>`).join('')}</ul><div class="vote"><span style="font-size:13px;color:var(--ink2);font-weight:700">Audience vote</span><button class="heart ${u&&l.includes(u)?'on':''}" data-act="vote" data-v="${a.id}">♥ ${l.length}</button></div></div></div>` }).join('');
  $('#runorder').innerHTML=RUN.map(r=>`<div class="tl" style="--c:${r[2]}"><b>${r[0]}</b><span>${r[1]}</span></div>`).join('') }

/* ====== MUSEUM ====== */
$('#eras').innerHTML=ERAS.map(e=>`<div class="era" style="--c:${e[2]}"><div class="yr">${e[0]}</div><h4>${e[1]}</h4><p>${e[3]}</p></div>`).join('');
let AC=null; function ac(){ if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)() }catch(e){ toast('Sound is not available in this browser') } } if(AC&&AC.state==='suspended') AC.resume(); return AC }
function tone(f,dur=.45,type='triangle',when=0){ const a=ac(); if(!a) return; const o=a.createOscillator(),g=a.createGain(); o.type=type; o.frequency.value=f; const t=a.currentTime+when; g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.25,t+.02); g.gain.exponentialRampToValueAtTime(.001,t+dur); o.connect(g).connect(a.destination); o.start(t); o.stop(t+dur+.05) }
$('#insts').innerHTML=INST.map((x,i)=>`<div class="inst"><div class="pic"><svg viewBox="0 0 160 110" width="160" height="110">${x.svg}</svg></div><div class="origin">${x.o}</div><h4>${x.n}</h4><p>${x.d}</p><button class="btn ghost" data-i="${i}">🔊 Listen</button></div>`).join('');
$$('#insts [data-i]').forEach(b=>b.onclick=()=>{ const x=INST[+b.dataset.i]; x.f.forEach((f,k)=>tone(f,x.drum?.25:.5,x.w,k*.28)) });
$$('#halls .cat').forEach(b=>b.onclick=()=>{ $$('#halls .cat').forEach(c=>c.classList.toggle('on',c===b)); $$('.hall').forEach(h=>h.hidden=h.id!==b.dataset.hall) });
const WK=[['C',261.63,'a'],['D',293.66,'s'],['E',329.63,'d'],['F',349.23,'f'],['G',392,'g'],['A',440,'h'],['B',493.88,'j'],['C',523.25,'k']];
const BK=[[0,277.18,'w'],[1,311.13,'e'],[3,369.99,'t'],[4,415.3,'y'],[5,466.16,'u']];
const pn=$('#piano'); pn.innerHTML=WK.map(k=>`<div class="wk" data-f="${k[1]}" data-k="${k[2]}">${k[0]}<br>${k[2].toUpperCase()}</div>`).join('')+BK.map(b=>`<div class="bk" data-f="${b[1]}" data-k="${b[2]}" style="left:calc(${(b[0]+1)*12.5}% - 3.5%)"></div>`).join('');
function press(el){ if(!el) return; tone(+el.dataset.f,.6,'triangle'); el.classList.add('down'); setTimeout(()=>el.classList.remove('down'),160) }
pn.addEventListener('pointerdown',e=>press(e.target.closest('[data-f]')));
addEventListener('keydown',e=>{ if(!$('#museum').classList.contains('active')||$('#h-piano').hidden||e.repeat||/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; press(pn.querySelector(`[data-k="${e.key.toLowerCase()}"]`)) });
/* quiz */
let qi=0,score=0,qAns=[],pendingQuiz=null;
async function saveQuiz(r){ if(!me()) return false; try{ await store.saveQuiz(r); return true }catch(err){ toast(err.message); return false } }
async function renderQuiz(){ const box=$('#quiz');
  if(qi>=QUIZ.length){ const r={score,total:QUIZ.length,answers:[...qAns],at:Date.now()}; const saved=await saveQuiz(r); if(!saved) pendingQuiz=r;
    box.innerHTML=`<div class="empty"><div style="font-size:56px">${score>=4?'🏆':'🎵'}</div><h3 style="font-family:Fredoka;font-size:26px">You scored ${score}/${QUIZ.length}</h3><p>${score>=4?'Music expert! Show this at the donation desk for a high-five.':'Nice try — visit Hall 1 and 2, then play again!'}</p>
     <p style="margin-top:8px;font-weight:700">${saved?'✅ Your result has been saved.':'Your result is not saved yet.'}</p>
     <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap">${saved?'':'<button class="btn primary" id="qsave">Sign in to save my result</button>'}<button class="btn ghost" id="qre">Play again</button></div></div>`;
    $('#qre').onclick=()=>{qi=0;score=0;qAns=[];pendingQuiz=null;renderQuiz()};
    if($('#qsave')) $('#qsave').onclick=()=>openAuth('login',async()=>{ if(pendingQuiz&&await saveQuiz(pendingQuiz)){ pendingQuiz=null; toast('✅ Quiz result saved'); $('#qsave')?.remove() } });
    if(score>=4) confetti(); return }
  const q=QUIZ[qi]; box.innerHTML=`<p style="font-weight:800;color:var(--lilac)">Question ${qi+1} of ${QUIZ.length}</p><h3 style="font-family:Fredoka;font-size:22px;margin:4px 0 8px">${q[0]}</h3><div class="quiz">${q[1].map((o,i)=>`<button class="qopt" data-o="${i}">${o}</button>`).join('')}</div>${me()?'':'<p class="hint">Tip: log in so your result is saved.</p>'}`;
  $$('.qopt').forEach(b=>b.onclick=()=>{ const pick=+b.dataset.o, ok=pick===q[2]; qAns.push(pick); if(ok){score++;tone(784,.3);tone(1047,.4,'triangle',.12)} else tone(196,.4,'sawtooth'); $$('.qopt').forEach((x,i)=>{x.disabled=true; if(i===q[2]) x.classList.add('ok')}); if(!ok) b.classList.add('no'); setTimeout(()=>{qi++;renderQuiz()},900) }) }

/* ====== MERCH ====== */
let mcat='All'; const msel={};
function renderMerch(){ const wish=store?store.myWish():[];
  $('#mcats').innerHTML=['All','Wear','Fan gear','Paper'].map(c=>`<button class="cat ${c===mcat?'on':''}" data-c="${c}">${c}</button>`).join('')+`<span class="cat" style="margin-left:auto;cursor:default">💝 Wishlist: ${wish.length}</span>`;
  $$('#mcats [data-c]').forEach(b=>b.onclick=()=>{mcat=b.dataset.c;renderMerch()});
  $('#mgrid').innerHTML=MERCH.map((m,i)=>({m,i})).filter(({m})=>mcat==='All'||m.c===mcat).map(({m,i})=>{ const col=msel[i]??m.sw[0], inW=wish.includes(m.n), l=merchLeft(m.n); return `<div class="mcard" id="m-${i}"><div class="pic" style="--bgc:${m.bgc}"><span class="stock" style="${l?'':'color:#d6285a'}">${l?l+' left':'Out of stock'}</span><svg viewBox="0 0 160 150" width="170" height="160">${m.svg(col)}</svg></div><div class="b"><h4>${m.n}</h4><p>${m.d}</p><div class="swatches">${m.sw.map(s=>`<button class="sw ${s===col?'on':''}" style="background:${s}" data-act="swatch" data-m="${i}" data-s="${s}" aria-label="colour"></button>`).join('')}</div><div style="display:flex;justify-content:space-between;align-items:center"><b style="color:var(--mint)">Gift for donors</b><button class="heart ${inW?'on':''}" data-act="wish" data-w="${m.n}">${inW?'✓ In wishlist':'+ Wishlist'}</button></div></div></div>` }).join('') }

/* ====== CONTACT ====== */
$('#cform').onsubmit=e=>{ e.preventDefault(); const txt=`To: 10C9 Music Concert team\nTopic: ${$('#ctopic').value}\nFrom: ${$('#cname').value}${$('#crole').value?' ('+$('#crole').value+')':''}\n\n${$('#cmsg').value}`;
  $('#cout').innerHTML=`<p style="margin-top:16px;font-weight:700">Your message is ready. Copy it and send it to your class representative or homeroom teacher:</p><div class="msgout">${esc(txt)}</div><button class="btn ghost" style="margin-top:10px" id="cpy">📋 Copy message</button>`;
  $('#cpy').onclick=async()=>{ try{ await navigator.clipboard.writeText(txt); toast('Copied!') }catch(err){ toast('Please select the text and copy it') } } };

/* ====== ADMIN DASHBOARD ====== */
const adm={tab:'overview',ev:'main',q:'',note:'',open:{}};
const meter=p=>`<div class="meter" title="${Math.round(p)}%"><i style="width:${Math.max(0,Math.min(100,p))}%"></i></div>`;
const kpi=(l,v,s,p)=>`<div class="kpi"><span>${l}</span><b class="num">${v}</b><small>${s}</small>${p!=null?meter(p):''}</div>`;
const pct=(a,b)=>b?a/b*100:0;
function renderAdmin(){ if(!isAdmin()) return;
  const tabs=[['overview','📊 Overview'],['users','👥 Users'],['tickets','🎫 Tickets & Seats'],['quiz','❓ Quiz results'],['merch','🛍️ Merchandise']];
  $('#admTabs').innerHTML=tabs.map(t=>`<button class="cat ${adm.tab===t[0]?'on':''}" data-act="admtab" data-t="${t[0]}">${t[1]}</button>`).join('');
  $('#admBody').innerHTML=({overview:admOverview,users:admUsers,tickets:admTickets,quiz:admQuiz,merch:admMerch})[adm.tab]() }

function admOverview(){
  const ALLU=store.users(), TK=store.tickets(), QZ=store.quiz(), WA=store.wishAll();
  const users=ALLU.filter(x=>x.role==='user').length, admins=ALLU.length-users;
  let iss=0,capT=0,seatIss=0,seatCap=0; BOOKABLE.forEach(e=>TYPES.forEach(t=>{ const i=issued(e.id,t.id),c=cap(e.id,t.id); iss+=i; capT+=c; if(t.seated){ seatIss+=i; seatCap+=c } }));
  const att=QZ.length, avg=att?QZ.reduce((a,q)=>a+q.score,0)/att:0;
  const stock=MERCH.reduce((a,m)=>a+merchInv(m.n).stock,0), given=MERCH.reduce((a,m)=>a+merchInv(m.n).given,0);
  const wishes=Object.values(WA).reduce((a,l)=>a+l.length,0);
  const bookings=TK.filter(t=>t.status!=='cancelled').length, checked=TK.filter(t=>t.status==='checked').reduce((a,t)=>a+t.qty,0);
  return `<div class="kpis">
    ${kpi('Registered accounts',ALLU.length,`${users} users · ${admins} admins`)}
    ${kpi('Tickets issued',iss,`of ${capT} available (${Math.round(pct(iss,capT))}%) · ${bookings} bookings`,pct(iss,capT))}
    ${kpi('Seats taken',seatIss,`of ${seatCap} open seats (${Math.round(pct(seatIss,seatCap))}%)`,pct(seatIss,seatCap))}
    ${kpi('Checked in',checked,'guests at the entrance')}
    ${kpi('Quiz attempts',att,att?`average ${avg.toFixed(1)} / ${QUIZ.length}`:'no attempts yet')}
    ${kpi('Merch given out',given,`of ${stock} in stock (${Math.round(pct(given,stock))}%) · ${wishes} wishlist requests`,pct(given,stock))}
  </div>
  ${BOOKABLE.map(e=>`<div class="apanel"><h3>${e.t} — tickets by type</h3><div class="bars">${TYPES.map(t=>{ const i=issued(e.id,t.id),c=cap(e.id,t.id); return `<div class="bar-row" title="${t.name}: ${i} of ${c}"><span>${t.em} ${t.name}</span>${meter(pct(i,c))}<span class="num">${i}/${c}</span></div>` }).join('')}</div></div>`).join('')}
  <div class="apanel"><h3>Audience votes</h3><div class="bars">${ACTS.map(a=>{ const n=store.votes(a.id).length, mx=Math.max(1,...ACTS.map(x=>store.votes(x.id).length)); return `<div class="bar-row" title="${a.name}: ${n} votes"><span>${a.name}</span>${meter(pct(n,mx))}<span class="num">${n}</span></div>` }).join('')}</div></div>
  <div class="apanel"><h3>Danger zone</h3><p style="font-size:14px;color:var(--ink2);margin-bottom:10px">Clear all tickets, quiz results, votes, wishlists, user accounts (admins are kept) and reset stock — e.g. after a demo run.</p><button class="btn danger xs" data-act="resetdemo" data-confirm="Tap again to reset everything">Reset event data</button></div>` }

function admUsers(){ const q=adm.q.toLowerCase(), self=me().id, ALLU=store.users(), TK=store.tickets(), QZ=store.quiz();
  const list=ALLU.filter(u=>!q||(u.u+' '+u.name+' '+u.cls).toLowerCase().includes(q));
  return `${adm.note?`<div class="adm-note">🔑 ${esc(adm.note)}</div>`:''}
  <div class="apanel"><h3>Add a user</h3><div class="addform">
    <input id="auName" placeholder="Full name"><input id="auCls" placeholder="Class / role"><input id="auUser" placeholder="username"><input id="auPass" placeholder="Password (min 6)" type="password">
    <select id="auRole"><option value="user">User</option><option value="admin">Admin</option></select><button class="btn primary xs" data-act="adduser">+ Add user</button></div></div>
  <div class="apanel"><div class="toolbar"><h3 style="margin:0">All accounts (${ALLU.length})</h3><input data-chg="admq" placeholder="Search name, username, class…" value="${esc(adm.q)}" style="margin-left:auto"></div>
  <table class="t"><thead><tr><th>User</th><th>Class / role</th><th>Role</th><th>Status</th><th>Tickets</th><th>Best quiz</th><th>Joined</th><th>Actions</th></tr></thead><tbody>
  ${list.map(u=>{ const tk=TK.filter(t=>t.uid===u.id&&t.status!=='cancelled').reduce((a,t)=>a+t.qty,0), qs=QZ.filter(x=>x.uid===u.id), best=qs.length?Math.max(...qs.map(x=>x.score)):null, isMe=u.id===self;
    return `<tr><td><b>${esc(u.name)}</b>${isMe?' <small>(you)</small>':''}<br><small style="color:var(--ink2)">@${esc(u.u)}</small></td><td>${esc(u.cls)||'—'}</td>
    <td><select data-chg="setrole" data-u="${u.id}" ${isMe?'disabled':''}><option value="user" ${u.role==='user'?'selected':''}>User</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select></td>
    <td><span class="status ${u.active?'st-active':'st-cancelled'}">${u.active?'Active':'Locked'}</span></td><td class="num">${tk}</td><td class="num">${best==null?'—':best+'/'+QUIZ.length}</td><td>${fmtDate(u.at)}</td>
    <td>${isMe?'<small style="color:var(--ink2)">—</small>':`<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn ghost xs" data-act="lock" data-u="${u.id}">${u.active?'Lock':'Unlock'}</button><button class="btn ghost xs" data-act="resetpw" data-u="${u.id}">Reset password</button><button class="btn danger xs" data-act="deluser" data-u="${u.id}" data-confirm="Sure?">Delete</button></div>`}</td></tr>` }).join('')||'<tr><td colspan="8" class="empty">No matching users</td></tr>'}
  </tbody></table></div>` }

function admTickets(){ const ev=adm.ev, E=EVENTS.find(e=>e.id===ev), q=adm.q.toLowerCase(), tk=takenSeats(ev);
  const rows=store.tickets().filter(t=>t.evId===ev&&(!q||(t.code+' '+t.name+' '+t.u+' '+t.seats).toLowerCase().includes(q)));
  return `<div class="toolbar"><select data-chg="admev">${BOOKABLE.map(e=>`<option value="${e.id}" ${e.id===ev?'selected':''}>${e.t}</option>`).join('')}</select></div>
  <div class="apanel"><h3>Ticket quantities — ${E.t}</h3>
  <table class="t"><thead><tr><th>Ticket type</th><th>Seats in map</th><th>Tickets available (edit)</th><th>Issued</th><th>Remaining</th><th style="width:22%">Fill</th></tr></thead><tbody>
  ${TYPES.map(t=>{ const i=issued(ev,t.id), c=cap(ev,t.id); return `<tr><td>${t.em} <b>${t.name}</b></td><td class="num">${t.seated?seatCount(t):'Standing'}</td><td><input type="number" id="cap-${t.id}" min="${i}" max="${t.seated?seatCount(t):2000}" value="${c}"></td><td class="num">${i}</td><td class="num">${Math.max(0,c-i)}</td><td>${meter(pct(i,c))}</td></tr>` }).join('')}
  </tbody></table><div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;flex-wrap:wrap;gap:10px"><small style="color:var(--ink2)">Seated types can open up to the seats in the map; seats beyond the number available show as closed. You can't go below tickets already issued.</small><button class="btn primary xs" data-act="savecap">💾 Save quantities</button></div></div>
  <div class="apanel"><h3>Seat occupancy</h3><div class="bars">${TYPES.filter(t=>t.seated).map(t=>{ const taken=t.rows.reduce((a,r)=>{ for(let n=1;n<=SEATS_PER_ROW;n++) if(tk.has(r+n)) a++; return a },0), open=cap(ev,t.id); return `<div class="bar-row" title="${taken} of ${open} open seats taken"><span>${t.name} <small style="color:var(--ink2)">(rows ${t.rows.join(', ')})</small></span>${meter(pct(taken,open))}<span class="num">${taken}/${open}</span></div>` }).join('')}</div></div>
  <div class="apanel"><div class="toolbar"><h3 style="margin:0">Bookings (${rows.length})</h3><input data-chg="admq" placeholder="Search code, name, seat…" value="${esc(adm.q)}" style="margin-left:auto"></div>
  <table class="t"><thead><tr><th>Code</th><th>Guest</th><th>Type</th><th>Seats</th><th>Qty</th><th>Pledge</th><th>Booked</th><th>Status</th><th>Actions</th></tr></thead><tbody>
  ${rows.map(t=>`<tr><td><b>${t.code}</b></td><td>${esc(t.name)}<br><small style="color:var(--ink2)">@${esc(t.u)} · ${esc(t.cls)||'—'}</small></td><td>${esc(t.type)}</td><td>${esc(t.seats)}</td><td class="num">${t.qty}</td><td><small>${esc(t.pledge)||'—'}</small></td><td>${fmtDate(t.at)}</td><td><span class="status st-${t.status}">${ST[t.status]}</span></td>
   <td><div style="display:flex;gap:6px;flex-wrap:wrap">${t.status==='active'?`<button class="btn ok xs" data-act="tkstatus" data-code="${t.code}" data-s="checked">Check in</button><button class="btn danger xs" data-act="tkstatus" data-code="${t.code}" data-s="cancelled" data-confirm="Sure?">Cancel</button>`:''}${t.status!=='active'?`<button class="btn ghost xs" data-act="tkstatus" data-code="${t.code}" data-s="active">${t.status==='checked'?'Undo check-in':'Restore'}</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="9" class="empty">No bookings yet</td></tr>'}
  </tbody></table></div>` }

function admQuiz(){ const A=store.quiz(), n=A.length, avg=n?A.reduce((a,q)=>a+q.score,0)/n:0, perfect=A.filter(q=>q.score===QUIZ.length).length, people=new Set(A.map(q=>q.uid||q.u)).size;
  return `<div class="kpis">${kpi('Attempts',n,`by ${people} people`)}${kpi('Average score',n?avg.toFixed(1):'—',`out of ${QUIZ.length}`,n?pct(avg,QUIZ.length):null)}${kpi('Perfect scores',perfect,n?`${Math.round(pct(perfect,n))}% of attempts`:'—')}</div>
  <div class="apanel"><h3>Correct answers by question</h3><div class="bars">${QUIZ.map((q,i)=>{ const c=A.filter(a=>a.answers[i]===q[2]).length; return `<div class="bar-row" title="${c} of ${n} correct"><span>Q${i+1}. ${esc(q[0])}</span>${meter(pct(c,n))}<span class="num">${n?Math.round(pct(c,n))+'%':'—'}</span></div>` }).join('')}</div></div>
  <div class="apanel"><h3>All results</h3><table class="t"><thead><tr><th>When</th><th>User</th><th>Class / role</th><th>Score</th><th></th></tr></thead><tbody>
  ${A.map((a,k)=>`<tr><td>${fmtDate(a.at)}</td><td><b>${esc(a.name)}</b> <small style="color:var(--ink2)">@${esc(a.u)}</small></td><td>${esc(a.cls)||'—'}</td><td class="num">${a.score}/${a.total}</td><td><button class="btn ghost xs" data-act="qdetail" data-i="${k}">${adm.open[k]?'Hide':'View answers'}</button></td></tr>
   ${adm.open[k]?`<tr class="detail"><td colspan="5">${QUIZ.map((q,i)=>{ const p=a.answers[i], ok=p===q[2]; return `<div style="margin:4px 0">${ok?'✅':'❌'} <b>Q${i+1}.</b> ${esc(q[0])} — answered <b>${esc(q[1][p]??'—')}</b>${ok?'':` · correct: <b>${esc(q[1][q[2]])}</b>`}</div>` }).join('')}</td></tr>`:''}`).join('')||'<tr><td colspan="5" class="empty">No quiz results yet</td></tr>'}
  </tbody></table></div>` }

function admMerch(){ const totalS=MERCH.reduce((a,m)=>a+merchInv(m.n).stock,0), totalG=MERCH.reduce((a,m)=>a+merchInv(m.n).given,0);
  const wishers=n=>Object.entries(store.wishAll()).filter(([u,l])=>l.includes(n)).map(([u])=>u);
  return `<div class="kpis">${kpi('Total stock',totalS,'items across the collection')}${kpi('Given out',totalG,`${Math.round(pct(totalG,totalS))}% of stock`,pct(totalG,totalS))}${kpi('Remaining',totalS-totalG,'items left to give')}</div>
  <div class="apanel"><h3>Stock & giveaways</h3><table class="t"><thead><tr><th>Item</th><th>Stock (edit)</th><th>Given out</th><th>Remaining</th><th style="width:18%">Given</th><th>Wishlisted by</th></tr></thead><tbody>
  ${MERCH.map((m,i)=>{ const inv=merchInv(m.n), w=wishers(m.n); return `<tr><td><b>${m.n}</b><br><small style="color:var(--ink2)">${m.c}</small></td><td><input type="number" id="stk-${i}" min="${inv.given}" value="${inv.stock}"></td>
    <td><div style="display:flex;align-items:center;gap:6px"><button class="btn ghost xs" data-act="give" data-n="${m.n}" data-d="-1">−</button><span class="num" style="min-width:28px;text-align:center">${inv.given}</span><button class="btn ok xs" data-act="give" data-n="${m.n}" data-d="1">+1</button></div></td>
    <td class="num">${inv.stock-inv.given}</td><td>${meter(pct(inv.given,inv.stock))}</td>
    <td>${w.length?`<div class="chips">${w.map(u=>`<span class="uchip">@${esc(userName(u))} <button class="btn ok xs" data-act="givewish" data-n="${m.n}" data-u="${u}" title="Give this item and remove it from their wishlist">Give</button></span>`).join('')}</div>`:'<small style="color:var(--ink2)">—</small>'}</td></tr>` }).join('')}
  </tbody></table><div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;flex-wrap:wrap;gap:10px"><small style="color:var(--ink2)">Use +1 at the donation desk each time a gift is handed out. "Give" also clears it from that guest's wishlist.</small><button class="btn primary xs" data-act="savestock">💾 Save stock</button></div></div>` }

/* ====== SEARCH ====== */
const INDEX=[...ACTS.map(a=>({t:a.name,s:a.group+' · '+a.genre,i:'🎤',go:'performance',el:'act-'+a.id})),...INST.map(x=>({t:x.n,s:'Musical Museum · '+x.o,i:'🎻',go:'museum',hall:'h-inst'})),...MERCH.map((m,i)=>({t:m.n,s:'Merchandise · '+m.c,i:'🛍️',go:'merch',el:'m-'+i})),...EVENTS.map(e=>({t:e.t,s:e.m,i:'🎫',go:e.book?'ticketbox':e.go,ev:e.book?e.id:null}))];
$('#q').oninput=e=>{ const v=e.target.value.trim().toLowerCase(), r=$('#results'); if(!v){ r.classList.remove('show'); return }
  const hits=INDEX.filter(x=>(x.t+' '+x.s).toLowerCase().includes(v)).slice(0,7);
  r.innerHTML=hits.length?hits.map((h,k)=>`<button data-h="${k}"><span>${h.i}</span><span>${h.t}<br><small>${h.s}</small></span></button>`).join(''):'<div style="padding:12px 16px;color:var(--ink2)">No results</div>'; r.classList.add('show');
  $$('#results [data-h]').forEach(b=>b.onclick=()=>{ const h=hits[+b.dataset.h]; r.classList.remove('show'); $('#q').value=''; go(h.go); if(h.ev) pickEvent(h.ev);
    if(h.hall) $(`#halls [data-hall="${h.hall}"]`).click(); if(h.go==='performance'){ genre='All'; renderPerf() } if(h.go==='merch'){ mcat='All'; renderMerch() }
    if(h.el) setTimeout(()=>{ const el=document.getElementById(h.el); if(el){ el.scrollIntoView({behavior:'smooth',block:'center'}); el.animate([{transform:'scale(1)'},{transform:'scale(1.05)'},{transform:'scale(1)'}],{duration:600}) } },350) }) };

/* ====== START ====== */
function renderAll(){ renderHeader(); renderEvents(); renderTB(); renderPerf(); renderMerch(); if($('#admin').classList.contains('active')) renderAdmin() }
(async()=>{
  try{ store=await createStore(); await store.init() }
  catch(err){ console.error(err); toast(err.message||'Could not load data') }
  if(store?.mode==='unconfigured'){ const bar=document.createElement('div'); bar.setAttribute('role','alert');
    bar.style.cssText='background:#2b2350;color:#ffc93c;text-align:center;padding:10px 16px;font-weight:700;font-size:14px';
    bar.textContent='⚠️ '+NOT_CONFIGURED_MESSAGE; document.body.prepend(bar) }
  renderQuiz(); renderAll(); go(location.hash.slice(1)||'home');
  // keep numbers fresh when the tab is shown again (e.g. admin dashboard on the entrance laptop)
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&store&&!busy) store.refresh().then(renderAll).catch(()=>{}) });
})();