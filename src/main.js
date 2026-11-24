import './styles.css';
import { createStore, NOT_CONFIGURED_MESSAGE } from './store/index.js';
import qrcode from 'qrcode-generator';
import { SEATS_PER_ROW, USERNAME_RE } from './config.js';
import { stickersFor, startScanner, stopScanner, findCode } from './checkin.js';

/* ====== EDIT HERE: show date & time ====== */
const SHOW = { date: new Date('2026-11-23T13:30:00+07:00'), label: 'Mon, 23 Nov 2026 · 13:30–15:00' };

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = t => new Date(t).toLocaleString('en-GB', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
function toast(t){ const el=$('#toast'); el.textContent=t; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),2600) }
function confetti(){ const cs=['#ff5c8a','#ffc93c','#2ec4a6','#3fa9f5','#8b6cf6']; for(let i=0;i<60;i++){ const c=document.createElement('i'); c.className='confetti'; c.style.left=Math.random()*100+'vw'; c.style.background=cs[i%5]; c.style.animationDelay=Math.random()*.6+'s'; c.style.borderRadius=Math.random()>.5?'50%':'2px'; document.body.appendChild(c); setTimeout(()=>c.remove(),3200) } }

/* floating notes */
(function(){ const n=['♪','♫','♬','♩','🎵','🎶']; for(let i=0;i<14;i++){ const s=document.createElement('span'); s.className='note'; s.textContent=n[i%n.length]; s.style.left=(i*7.3)%100+'vw'; s.style.animationDelay=(-i*1.3)+'s'; s.style.animationDuration=(12+i%5*3)+'s'; s.style.color=['#ff5c8a','#8b6cf6','#2ec4a6','#3fa9f5','#ffc93c'][i%5]; $('#bg').appendChild(s) } })();
/* logo fallback */
(function(){ const img=$('#logo'); const fb=()=>{ $('#logoWrap').innerHTML='<svg viewBox="0 0 80 80" width="78" height="78"><circle cx="40" cy="40" r="38" fill="#fff"/><circle cx="40" cy="40" r="33" fill="none" stroke="#1d4fa3" stroke-width="3"/><text x="40" y="38" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="17" fill="#1d4fa3">NVL</text><text x="40" y="54" text-anchor="middle" font-family="Nunito" font-weight="800" font-size="8" fill="#d6283b">HIGH SCHOOL</text></svg>' }; img.addEventListener('error',fb); if(img.complete && !img.naturalWidth) fb(); })();

/* ====== CONTENT (from the STEAM lesson plan "MUSIC FOR CHANGE") ====== */
const EVENTS=[
 {id:'main',cat:'Concert',em:'🎤',bg:'linear-gradient(135deg,#ff5c8a,#ffc93c)',t:'MUSIC FOR CHANGE – Mini Charity Concert',m:SHOW.label,v:'School Hall',book:true},
 {id:'checkin',cat:'Check-in',em:'📲',bg:'linear-gradient(135deg,#8b6cf6,#3fa9f5)',t:'Check-in: scan your QR, hand in your notebooks',m:'Mon 23 Nov · 13:15–13:30',v:'Hall entrance · 3 desks',go:'ticketbox'},
 {id:'mashup',cat:'Show',em:'🥁',bg:'linear-gradient(135deg,#ff8a5c,#8b6cf6)',t:'Mashup: Baby Shark → Baby → I Am the Best',m:'13:42–13:54 · with Q&A',v:'Main stage',go:'performance'},
 {id:'singfill',cat:'Show',em:'🎶',bg:'linear-gradient(135deg,#2ec4a6,#3fa9f5)',t:'Sing & Fill: listen and fill in 6 words',m:'13:54–14:06',v:'Main stage',go:'performance'},
 {id:'zoneA',cat:'Backstage Tour',em:'🎸',bg:'linear-gradient(135deg,#ffc93c,#ff8a5c)',t:'Zone A · Instrument Museum',m:'14:06–14:43 · 2 rounds',v:'Zone A',go:'museum'},
 {id:'zoneB',cat:'Backstage Tour',em:'💡',bg:'linear-gradient(135deg,#3fa9f5,#2ec4a6)',t:'Zone B · Digital Stage Lab (Beat Light)',m:'14:06–14:43 · 2 rounds',v:'Zone B',go:'museum'}
];
const BOOKABLE=EVENTS.filter(e=>e.book);
// Ticket types reuse the database zones A / B / F (no schema change). nb = notebooks per ticket.
const TYPES=[
 {id:'A',name:'VIP · 3 notebooks',desc:'Front rows (after our guests), a bottle of water, a 10C9 buddy guide and first turn on the Backstage Tour.',em:'⭐',bgc:'#ffe3ec',zc:'#ff5c8a',rows:['A','B','C'],seated:true,nb:3},
 {id:'B',name:'Standard · 1 notebook',desc:'General seating. Every activity included — you can complete the whole passport.',em:'🎵',bgc:'#e0f3ff',zc:'#3fa9f5',rows:['D','E','F'],seated:true,nb:1},
 {id:'F',name:'Standard · 1 notebook (back rows)',desc:'Same as Standard, rows G–H.',em:'🎶',bgc:'#dcfbf2',zc:'#2ec4a6',rows:['G','H'],seated:true,nb:1}
];
const nbPer=typeId=>typeId==='A'?3:1;
const nbOf=t=>t.qty*nbPer(t.typeId);
const seatCount=t=>t.seated?t.rows.length*SEATS_PER_ROW:Infinity;
const ACTS=[
 {id:1,name:'Ticket & Media',group:'Group 1',genre:'System',g:'linear-gradient(135deg,#ff5c8a,#ff8a5c)',desc:'How do we know exactly how many guests are coming, how many seats we need, and count the notebooks fairly?',songs:[['🎫 Online tickets & QR check-in','N1'],['🎙️ Bilingual MCs · photos & video','N1'],['➗ Math: sets (F ∪ L) & propositions','M']]},
 {id:2,name:'Pop Band',group:'Group 2',genre:'Music',g:'linear-gradient(135deg,#2ec4a6,#3fa9f5)',desc:'Where do we put the speakers and microphones so the back row hears clearly but the front row is not too loud?',songs:[['🎵 Mashup: Baby Shark → Baby → I Am the Best','6′'],['🎶 Sing & Fill with the audience','12′'],['🔊 Physics: Sound Check in dB, averages','S']]},
 {id:3,name:'Sound Makers',group:'Group 3',genre:'Instruments',g:'linear-gradient(135deg,#8b6cf6,#3fa9f5)',desc:'How can instruments made from recycled materials play the right notes for our songs, with the band, safely?',songs:[['🎸 Recycled guitar & ukulele (fret 12 by measuring)','E'],['🥁 Bucket drum: 3 levels of tightness','E'],['📏 Physics: safety & measurement error','S']]},
 {id:4,name:'Digital Stage',group:'Group 4',genre:'Digital stage',g:'linear-gradient(135deg,#ffc93c,#ff8a5c)',desc:'How can the screen, the website and the lights serve the audience automatically and follow the music?',songs:[['🖥️ Stage screen, website, QR codes, notebook counter','T'],['💡 Light sticks & Beat Light','E'],['💻 IT: input → processing → output','T']]}
];
const RUN=[
 ['13:15','Check-in (3 desks): scan QR, hand in notebooks, get passport & light stick · Sticker 1','#8b6cf6'],
 ['13:30','Warm-up: notebook counter on screen; MC shows a check-in in English','#ff5c8a'],
 ['13:36','Opening: bilingual MCs introduce the 4 parts; Mr Tran Quang\'s welcome','#ff8a5c'],
 ['13:42','Mashup (6′) with recycled instruments, light sticks & Beat Light + Q&A with the band (★ Bonus)','#ffc93c'],
 ['13:54','Sing & Fill: scan the QR, fill in 6 words · Sticker 2','#2ec4a6'],
 ['14:06','Backstage Tour: Zone A Instrument Museum ⇄ Zone B Digital Stage Lab · Stickers 3–6','#3fa9f5'],
 ['14:43','Data report: notebooks, completed passports, Sing & Fill results; teachers\' comments','#8b6cf6'],
 ['14:53','Wrap-up: Unit 3 words, and / but / so, word stress — "Music can change lives when we act together."','#ff5c8a']
];
const INST=[
 {n:'Guitar',o:'Recycled · 6 strings',d:'This guitar has six strings. We made it from a wooden box. We measured the string four times to put fret 12 in the middle.',vi:'Đàn ghi-ta 6 dây làm từ thùng gỗ. Nhóm đo dây 4 lần để đặt phím 12 ở chính giữa dây.',q:'Press a string at a fret. The string is shorter, so the sound is ___.',f:[165,247,330,415,494,659],w:'triangle',svg:'<circle cx="55" cy="70" r="28" fill="#ff8a5c"/><circle cx="85" cy="62" r="20" fill="#ff8a5c"/><circle cx="62" cy="68" r="8" fill="#2b2350"/><rect x="95" y="55" width="55" height="9" fill="#6b4423"/>'},
 {n:'Ukulele',o:'Recycled · 4 strings',d:'This ukulele has four strings. We measured the string four times. Fret 12 is in the middle of the string.',vi:'Đàn ukulele 4 dây. Nhóm đo dây 4 lần; phím 12 nằm ở giữa dây.',q:'Press a string at a fret. The string is shorter, so the sound is ___.',f:[392,262,330,440],w:'triangle',svg:'<ellipse cx="60" cy="70" rx="24" ry="20" fill="#ffc93c"/><ellipse cx="82" cy="66" rx="16" ry="14" fill="#ffc93c"/><circle cx="64" cy="68" r="6" fill="#2b2350"/><rect x="92" y="61" width="52" height="7" fill="#6b4423"/>'},
 {n:'Drum',o:'Recycled bucket',d:'Our drum is an old bucket with a plastic skin. We tested three levels of tightness and chose the best one.',vi:'Trống làm từ xô cũ với mặt trống bằng màng nhựa. Nhóm thử 3 mức căng và chọn mức hợp nhất.',q:'A tighter drum skin makes a ___ sound.',f:[90,90,140,90],w:'sine',drum:true,svg:'<path d="M45 40 L115 40 L105 100 L55 100Z" fill="#8b6cf6"/><ellipse cx="80" cy="40" rx="35" ry="9" fill="#e9e3ff" stroke="#2b2350" stroke-width="2"/><line x1="120" y1="12" x2="92" y2="36" stroke="#6b4423" stroke-width="5" stroke-linecap="round"/>'}
];
// Physics Quiz (Sticker 5 – 2/3 or more)
const QUIZ=[
 ['Which is SAFE? (Việc nào an toàn?)',['Cut toward your body','Put the glue gun on its stand','Put water near the speaker'],1],
 ['A string is measured 3 times: 34 cm, 35 cm, 36 cm. The average is… (trung bình)',['34 cm','35 cm','105 cm'],1],
 ['Why do we measure many times? (Vì sao đo nhiều lần?)',['To get a more reliable result','To make the sound louder'],0]
];
// Sing & Fill — our own lyrics "Music for Change" (Sticker 2 – 4/6 or more)
const WORDS=['notebook','sing','sound','gifts','audience','volunteer','listen','talented'];
const LYRICS=['We bring a {0} and we bring a smile,','We {1} together, stay a little while.','Guitars and drums make a happy {2},','Wave your light stick, pass the love around!','Music for change, music for you,','Small {3} can make a dream come true.','Sing it out loud, let the {4} hear:','We {5} to help – we\'re glad you\'re here!'];
// Digital Stage Lab (Sticker 6 – 3/4 or more)
const LAB=[['Input (đầu vào)',['sound','light'],0],['Processing (xử lí)',['the circuit','the plastic tube'],0],['Output (kết quả)',['the light turns on','the drum plays'],0],['Is the Beat Light a smart device?',['Yes','No – it does not connect to other devices'],1]];
// Attempt kinds are told apart by their total (stored in quiz_attempts)
const KIND={6:'Sing & Fill',3:'Physics Quiz',4:'Digital Stage Lab',1:'Try & Answer',2:'Photo'};
// Concert kit (labels shown for the existing stock items in the database)
const MERCH=[
 {n:'Light stick',label:'Light stick (borrowed)',c:'Light',stock:80,bgc:'#e0f3ff',d:'LED module in a recycled plastic tube with colour film. Switch on and wave when the screen says so — please return it after the show.',sw:['#3fa9f5','#ffc93c','#ff5c8a'],svg:c=>`<rect x="72" y="70" width="16" height="60" rx="6" fill="#2b2350"/><circle cx="80" cy="50" r="30" fill="${c}" opacity=".9"/><circle cx="80" cy="50" r="40" fill="${c}" opacity=".2"/><text x="80" y="57" text-anchor="middle" font-size="20">♪</text>`},
 {n:'Name badge',label:'Concert Passport',c:'Paper',stock:80,bgc:'#f1ebff',d:'A4 folded into 4 bilingual A5 pages with 6 sticker boxes. Numbered, Blue or Yellow for your Backstage Tour round.',sw:['#3fa9f5','#ffc93c'],svg:c=>`<rect x="40" y="20" width="80" height="110" rx="8" fill="${c}" stroke="#2b2350" stroke-width="2"/><text x="80" y="62" text-anchor="middle" font-family="Fredoka" font-size="13" fill="#2b2350">CONCERT</text><text x="80" y="80" text-anchor="middle" font-family="Fredoka" font-size="13" fill="#2b2350">PASSPORT</text><text x="80" y="108" text-anchor="middle" font-size="18">♫</text>`},
 {n:'Sticker set',label:'Passport stickers',c:'Paper',stock:100,bgc:'#fff1c9',d:'1 Check-in · 2 Sing & Fill · 3 Photo · 4 Try & Answer · 5 Physics Quiz · 6 Digital Stage — plus ★ Bonus.',sw:['#ffc93c','#2ec4a6'],svg:c=>`<rect x="35" y="25" width="90" height="100" rx="12" fill="#fff" stroke="#2b2350" stroke-width="2"/><circle cx="60" cy="52" r="14" fill="${c}"/><circle cx="100" cy="52" r="14" fill="#ff5c8a"/><circle cx="60" cy="96" r="14" fill="#8b6cf6"/><circle cx="100" cy="96" r="14" fill="${c}"/>`},
 {n:'Tote bag',label:'VIP water bottle',c:'VIP',stock:40,bgc:'#dcfbf2',d:'A small thank-you for VIP guests (3 notebooks), served by the 10C9 VIP team.',sw:['#2ec4a6','#3fa9f5'],svg:c=>`<rect x="66" y="22" width="28" height="14" rx="4" fill="#2b2350"/><path d="M60 40 Q60 34 66 34 L94 34 Q100 34 100 40 L104 128 Q104 134 98 134 L62 134 Q56 134 56 128Z" fill="${c}" opacity=".85" stroke="#2b2350" stroke-width="2"/><rect x="60" y="70" width="40" height="26" fill="#fff" opacity=".8"/><text x="80" y="88" text-anchor="middle" font-family="Fredoka" font-size="11" fill="#2b2350">VIP</text>`}
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
  if(location.hash!=='#'+v) history.replaceState(null,'','#'+v); if(v!=='admin'&&adm.scanning){ stopScanner(); adm.scanning=false } if(v!=='museum') stopMic(); if(v==='admin') renderAdmin(); window.scrollTo({top:0,behavior:'smooth'}) }
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
  wish:d=>{ if(!requireLogin(null,'Log in to make your kit list')) return; run(async()=>{ await store.toggleWish(d.w); renderMerch() }) },
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
  givewish:d=>run(async()=>{ await store.giveMerch(d.n,1,d.u); toast(`🎁 ${MERCH.find(m=>m.n===d.n)?.label||d.n} given to @${userName(d.u)}`); renderAll() }),
  savestock:()=>run(async()=>{ const map={}; MERCH.forEach((m,i)=>{ map[m.n]=Math.floor(+$(`#stk-${i}`).value) });
    const errs=await store.saveStock(map);
    toast(errs.length?'Stock must be at least the number given: '+errs.map(x=>`${MERCH.find(m=>m.n===x.item)?.label||x.item} ≥ ${x.min}`).join('; '):'✅ Merchandise stock updated'); renderAll() }),
  staffLogin:d=>{ $('#tixModal').classList.remove('show'); openAuth('login',()=>{ if(isAdmin()){ adm.tab='checkin'; adm.code=d.code; go('admin') } else toast('This account is not an admin') }) },
  scanToggle:()=>{ adm.scanErr=''; if(adm.scanning){ stopScanner(); adm.scanning=false } else adm.scanning=true; renderAdmin() },
  scanNext:()=>{ adm.code=''; renderAdmin() },
  doCheckin:d=>run(async()=>{ await store.setTicketStatus(d.code,'checked'); confetti(); toast('✅ Checked in — give the passport, light stick and Sticker 1'); renderAll() }),
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
function renderCats(){ $('#cats').innerHTML=['All','Concert','Check-in','Show','Backstage Tour'].map(c=>`<button class="cat ${c===ecat?'on':''}" data-c="${c}">${c}</button>`).join(''); $$('#cats .cat').forEach(b=>b.onclick=()=>{ecat=b.dataset.c;renderCats();renderEvents()}) }
function renderEvents(){ $('#events').innerHTML=EVENTS.filter(e=>ecat==='All'||e.cat===ecat).map(e=>{ const rem=e.book?TYPES.reduce((a,t)=>a+left(e.id,t.id),0):null; return `
  <div class="ecard" data-go="${e.book?'ticketbox':e.go}" ${e.book?`data-ev="${e.id}"`:''}>
   <div class="thumb" style="background:${e.bg}"><span class="tag">${e.cat}</span>${e.em}</div>
   <div class="body"><h4>${e.t}</h4><div class="meta">📅 ${e.m}</div><div class="meta">📍 ${e.v}</div>${e.book?`<div class="meta">🎫 ${rem} tickets left</div>`:''}<div class="price">${e.book?(rem?'📚 1–3 notebooks · Reserve now →':'Fully booked'):'Learn more →'}</div></div>
  </div>` }).join('') }
renderCats();
function renderNb(){ let tick=0,nb=0,vip=0,std=0; BOOKABLE.forEach(e=>TYPES.forEach(t=>{ const i=issued(e.id,t.id); tick+=i; nb+=i*t.nb; if(t.id==='A') vip+=i; else std+=i }));
  $('#nbCounter').innerHTML=kpi('📚 Notebooks pledged',nb,'from all tickets booked so far')+kpi('🎫 Tickets booked',tick,'one ticket per guest')+kpi('⭐ VIP',vip,'3 notebooks each')+kpi('🎵 Standard',std,'1 notebook each') }

/* ====== TICKETBOX ====== */
const newTB=()=>({ev:'main',step:0,type:null,qty:1,seats:[],phone:'',photo:null});
let tb=newTB();
function pickEvent(id){ tb={...newTB(),ev:id}; renderTB() }
const evInfo=()=>EVENTS.find(e=>e.id===tb.ev);
function renderTB(){
  $$('#steps .step').forEach((s,i)=>s.classList.toggle('on',i<=tb.step));
  const body=$('#stepBody'), act=$('#stepActions'), T=TYPES.find(t=>t.id===tb.type), u=me();
  if(tb.type&&left(tb.ev,tb.type)<1&&tb.step<3){ tb.type=null; tb.step=0 }
  if(tb.step===0){
    body.innerHTML=`<div class="field"><label>Event</label><select id="evSel">${BOOKABLE.map(e=>`<option value="${e.id}" ${e.id===tb.ev?'selected':''}>${e.t}</option>`).join('')}</select></div>`+
    TYPES.map(t=>{ const l=left(tb.ev,t.id); return `<div class="ttype ${tb.type===t.id?'sel':''} ${l?'':'out'}" data-t="${t.id}" style="--bgc:${t.bgc}"><div class="em">${t.em}</div><div><h4>${t.name}</h4><p>${t.desc}</p><span class="left ${l<10?'low':''}">${l?l+' left':'Sold out'}</span></div><div class="free">📚 ${t.nb} notebook${t.nb>1?'s':''}<div class="qty"><span style="color:var(--ink2);font-size:12px">${tb.type===t.id?'Selected ✓':'Select'}</span></div></div></div>` }).join('')+
    (u?'':`<div class="lock-card">🔒 <b>Sign in to reserve.</b> You can look around first — we'll ask you to log in when you continue.</div>`);
    $('#evSel').onchange=e=>{tb.ev=e.target.value;tb.seats=[];tb.type=null;renderTB()};
    $$('.ttype').forEach(el=>el.onclick=e=>{ const q=e.target.dataset.q; if(q){ tb.qty=Math.min(4,left(tb.ev,tb.type),Math.max(1,tb.qty+ +q)); tb.seats=[] } else if(tb.type!==el.dataset.t){ tb.type=el.dataset.t; tb.qty=1; tb.seats=[] } renderTB() });
    act.innerHTML=`<span style="font-size:13px;color:var(--ink2)">1 ticket per person — every guest gets their own passport</span><button class="btn primary" id="nx" ${tb.type?'':'disabled'}>Continue →</button>`;
  }
  if(tb.step===1){
    if(!T.seated) body.innerHTML=`<div class="empty"><div style="font-size:60px">🙌</div><h3 style="font-family:Fredoka">Fan Zone is standing only</h3><p>No seat to choose — just come early and find a good spot!</p></div>`;
    else{ const tk=takenSeats(tb.ev); let html='<div class="stage">STAGE</div><div class="seatmap"><div class="row"><label>★</label><span style="width:min(100%,430px);text-align:center;padding:5px;border-radius:8px;background:#f1ebff;font-size:12px;font-weight:800;color:var(--lilac)">Special guests</span></div>';
      TYPES.filter(t=>t.seated).forEach(z=>{ let k=0; const c=cap(tb.ev,z.id); z.rows.forEach(r=>{ html+=`<div class="row"><label>${r}</label>`; for(let n=1;n<=SEATS_PER_ROW;n++){ if(n===7) html+='<span class="gap"></span>'; const id=r+n, taken=tk.has(id)||k>=c, mine=tb.seats.includes(id), dim=z.id!==T.id; k++; html+=`<button class="seat ${taken?'taken':''} ${mine?'mine':''} ${dim?'dim':''}" style="--zc:${z.zc}" data-s="${id}" title="${id}">${n}</button>` } html+='</div>' }) });
      html+=`</div><div class="legend"><span><i style="background:${T.zc}"></i>Available</span><span><i style="background:var(--ink)"></i>Your seat</span><span><i style="background:#d8d3e8"></i>Reserved / closed</span></div><p style="text-align:center;margin-top:10px;font-weight:700">Choose ${tb.qty} seat(s): ${tb.seats.join(', ')||'—'}</p>`;
      body.innerHTML=html;
      $$('.seat').forEach(s=>s.onclick=()=>{ const id=s.dataset.s; if(tb.seats.includes(id)) tb.seats=tb.seats.filter(x=>x!==id); else if(tb.seats.length<tb.qty) tb.seats.push(id); else { tb.seats.shift(); tb.seats.push(id) } renderTB() }) }
    act.innerHTML=`<button class="btn ghost" id="bk">← Back</button><button class="btn primary" id="nx" ${(!T.seated||tb.seats.length===tb.qty)?'':'disabled'}>Continue →</button>`;
  }
  if(tb.step===2){
    body.innerHTML=`<div class="two"><div class="field"><label>Full name</label><input value="${esc(u.name)}" disabled></div><div class="field"><label>Class / role</label><input value="${esc(u.cls)||'—'}" disabled></div></div>
     <div class="field"><label>Phone or email (optional)</label><input id="fPh" value="${esc(tb.phone)}"></div>
     <div class="field"><label>Photos (chụp ảnh) *</label><div class="pledges"><button class="pledge ${tb.photo==='Yes'?'on':''}" data-p="Yes">📸 Yes, you may take my photo</button><button class="pledge ${tb.photo==='No'?'on':''}" data-p="No">🔴 No photo, please</button></div></div>
     <div class="note-box">📚 Please bring <b>${T.nb} notebook${T.nb>1?'s':''}</b> to the check-in desk (13:15–13:30). If you say no to photos, you get a red dot on your passport.</div>`;
    $('#fPh').oninput=e=>tb.phone=e.target.value;
    $$('#stepBody .pledge').forEach(b=>b.onclick=()=>{ tb.photo=b.dataset.p; renderTB() });
    act.innerHTML=`<button class="btn ghost" id="bk">← Back</button><button class="btn primary" id="nx" ${tb.photo?'':'disabled'}>Confirm booking 🎉</button>`;
  }
  if(tb.step===3){
    body.innerHTML=ticketHTML(tb.last)+`<p style="text-align:center;margin-top:16px;color:var(--ink2);font-size:14px">Saved to <b>My Tickets</b>. Show this QR code at the check-in desk — staff scan it with their phone.</p>`;
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
  <div class="line"><span>Ticket</span><b style="text-align:right">${T?T.name:'—'}</b></div>
  <div class="line"><span>Seat</span><b>${tb.seats.join(', ')||'—'}</b></div>
  <div class="line"><span>Photos</span><b>${tb.photo||'—'}</b></div>
  <div class="line"><span>Price</span><b>0 VND</b></div>
  <div class="line" style="border:none"><span>Bring</span><span class="total">📚 ${T?T.nb:'1–3'} notebook${T&&T.nb===1?'':'s'}</span></div>
  <div class="note-box">💛 All notebooks are counted publicly and handed to students in need through the school Youth Union.</div>` }
async function book(){ const T=TYPES.find(t=>t.id===tb.type), E=evInfo();
  await run(async()=>{
    try{ tb.last=await store.book({ev:E.id,evTitle:E.t,evWhen:E.m,type:T.id,typeName:T.name,qty:1,seats:T.seated?[...tb.seats]:[],phone:tb.phone,pledge:'Photo: '+tb.photo}) }
    catch(err){ if(/seat/i.test(err.message)){ tb.seats=[]; tb.step=1 } else if(/left|sold/i.test(err.message)) tb.step=0; throw err }
    tb.step=3; confetti(); toast('🎉 Ticket reserved!'); renderAll() }) }
// Real, scannable QR code. It holds a link to this site with the ticket code, so any phone
// camera can open it; the staff check-in scanner reads the code from the link.
const ticketUrl=code=>`${location.origin}/?ticket=${encodeURIComponent(code)}`;
function qr(code){ const q=qrcode(0,'M'); q.addData(ticketUrl(code)); q.make();
  return `<div style="width:150px;height:150px;background:#fff" role="img" aria-label="QR code for ticket ${esc(code)}">${q.createSvgTag({cellSize:4,margin:2,scalable:true})}</div>` }
const ST={active:'Active',checked:'Checked in',cancelled:'Cancelled'};
function ticketHTML(t,withActions){ return `<div class="eticket" style="${t.status==='cancelled'?'opacity:.55':''}"><div class="l"><span class="chip">E-TICKET · MUSIC FOR CHANGE</span><h3>${esc(t.ev)}</h3><div class="kv"><div>Guest<b>${esc(t.name)}</b></div><div>Class / role<b>${esc(t.cls)||'—'}</b></div><div>When<b>${esc(t.when)}</b></div><div>Ticket<b>${esc(t.type)}</b></div><div>Seat(s)<b>${esc(t.seats)}</b></div><div>Bring<b>📚 ${nbOf(t)} notebook${nbOf(t)>1?'s':''}</b></div></div>${t.pledge?`<p style="margin-top:12px;font-size:13px">${/No/.test(t.pledge)?'<span class="reddot"></span>':'📸 '}${esc(t.pledge)}</p>`:''}</div><div class="r">${qr(t.code)}<span>${t.code}</span><span class="status st-${t.status}">${ST[t.status]}</span>${withActions&&t.status==='active'?`<button class="btn danger xs" data-act="cancelmine" data-code="${t.code}" data-confirm="Tap again to cancel">Cancel ticket</button>`:''}</div></div>` }
function openTix(){ if(!requireLogin(openTix,'Sign in to see your tickets')) return; const l=myTickets();
  $('#tixList').innerHTML=l.length?l.map(t=>ticketHTML(t,true)).join('<div style="height:16px"></div>'):`<div class="empty"><div style="font-size:52px">🎫</div><p>No tickets yet.</p><button class="btn primary" style="margin-top:12px" data-go="ticketbox" data-close>Reserve a free ticket</button></div>`;
  $('#uMenu')?.classList.remove('show'); $('#tixModal').classList.add('show') }

/* ====== PERFORMANCE ====== */
let genre='All';
function renderPerf(){ const u=me()?.id;
  $('#genres').innerHTML=['All',...ACTS.map(a=>a.genre)].map(g=>`<button class="cat ${g===genre?'on':''}" data-g="${g}">${g}</button>`).join(''); $$('#genres .cat').forEach(b=>b.onclick=()=>{genre=b.dataset.g;renderPerf()});
  $('#lineup').innerHTML=ACTS.filter(a=>genre==='All'||a.genre===genre).map(a=>{ const l=store?store.votes(a.id):[]; return `<div class="act" id="act-${a.id}"><div class="head" style="--g:${a.g}"><span class="num">0${a.id}</span><small>${a.group} · ${a.genre}</small><h4>${a.name}</h4></div><div class="b"><p>${a.desc}</p><ul class="songs">${a.songs.map(s=>`<li><span>🎵 ${s[0]}</span><b>${s[1]}</b></li>`).join('')}</ul><div class="vote"><span style="font-size:13px;color:var(--ink2);font-weight:700">Audience vote</span><button class="heart ${u&&l.includes(u)?'on':''}" data-act="vote" data-v="${a.id}">♥ ${l.length}</button></div></div></div>` }).join('');
  $('#runorder').innerHTML=RUN.map(r=>`<div class="tl" style="--c:${r[2]}"><b>${r[0]}</b><span>${r[1]}</span></div>`).join('') }

/* Sing & Fill */
let sfDone=null;
function renderSingFill(){ const box=$('#singfill'); if(!box) return;
  const bank=[...WORDS].sort();
  box.innerHTML=`<p style="color:var(--ink2);font-size:14px">Our own song <b>“Music for Change”</b>. Scan the QR on the screen or play here: listen, fill in the 6 words, then press Submit.</p>
   <div class="lyrics">${LYRICS.map(l=>l.replace(/\{(\d)\}/,(m,i)=>`<input data-blank="${i}" autocomplete="off" aria-label="Blank ${+i+1}" placeholder="(${+i+1})">`)).join('<br>')}</div>
   <div><b style="font-size:14px">Word bank:</b><div class="wordbank">${bank.map(w=>`<button data-word="${w}">${w}</button>`).join('')}</div></div>
   <div class="actions"><span id="sfMsg" style="font-weight:800"></span><div style="display:flex;gap:10px"><button class="btn ghost" id="sfReset">Clear</button><button class="btn primary" id="sfSubmit">Submit ✓</button></div></div>`;
  let focus=null; $$('#singfill input').forEach(i=>i.onfocus=()=>focus=i);
  $$('#singfill [data-word]').forEach(b=>b.onclick=()=>{ const t=focus&&!focus.value?focus:[...$$('#singfill input')].find(i=>!i.value); if(t){ t.value=b.dataset.word; const nx=[...$$('#singfill input')].find(i=>!i.value); (nx||t).focus() } });
  $('#sfReset').onclick=()=>renderSingFill();
  $('#sfSubmit').onclick=async()=>{ const ins=[...$$('#singfill input')]; const answers=ins.map(i=>WORDS.indexOf(i.value.trim().toLowerCase()));
    let score=0; ins.forEach((inp,k)=>{ const ok=answers[k]===k; if(ok) score++; inp.classList.toggle('ok',ok); inp.classList.toggle('no',!ok) });
    const pass=score>=4; $('#sfMsg').textContent=`Your score: ${score}/6 ${pass?'— Sticker 2 ✓':'— try again (4/6 needed)'}`; if(pass) confetti();
    await saveActivity({score,total:6,answers},'Sing & Fill') } }

// Saves an activity result (needs sign-in so it counts on your passport)
async function saveActivity(r,label){ if(!me()){ openAuth('login',async()=>{ if(await saveQuiz(r)){ toast(`✅ ${label} result saved to your passport`); renderPassport() } }); toast('Log in to save it to your passport'); return false }
  const ok=await saveQuiz(r); if(ok){ toast(`✅ ${label} saved to your passport`); renderPassport() } return ok }

/* ====== MUSEUM ====== */
let AC=null; function ac(){ if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)() }catch(e){ toast('Sound is not available in this browser') } } if(AC&&AC.state==='suspended') AC.resume(); return AC }
function tone(f,dur=.45,type='triangle',when=0){ const a=ac(); if(!a) return; const o=a.createOscillator(),g=a.createGain(); o.type=type; o.frequency.value=f; const t=a.currentTime+when; g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.25,t+.02); g.gain.exponentialRampToValueAtTime(.001,t+dur); o.connect(g).connect(a.destination); o.start(t); o.stop(t+dur+.05) }
function renderInst(){ $('#insts').innerHTML=INST.map((x,i)=>`<div class="inst" id="inst-${i}"><div class="pic"><svg viewBox="0 0 160 110" width="160" height="110">${x.svg}</svg></div><div class="origin">${x.o}</div><h4>${x.n}</h4><p>${x.d}</p><p style="font-style:italic">${x.vi}</p>
   <button class="btn ghost" data-i="${i}">🔊 Listen</button>
   <div style="margin-top:12px;text-align:left;background:#f8f5ff;border-radius:14px;padding:12px"><b style="font-size:13px;color:var(--lilac)">TRY &amp; ANSWER · Sticker 4</b><p style="margin:4px 0 8px;color:var(--ink)">${x.q}</p>
   <div style="display:flex;gap:8px"><button class="qopt" style="flex:1;padding:8px" data-ta="${i}" data-o="0">higher</button><button class="qopt" style="flex:1;padding:8px" data-ta="${i}" data-o="1">lower</button></div></div>
   <button class="btn ghost xs" style="margin-top:10px" data-photo="${i}">📸 I took a photo with the ${x.n.toLowerCase()} (Sticker 3)</button></div>`).join('');
  $$('#insts [data-i]').forEach(b=>b.onclick=()=>{ const x=INST[+b.dataset.i]; x.f.forEach((f,k)=>tone(f,x.drum?.3:.6,x.w,k*(x.drum?.3:.12))) });
  $$('#insts [data-ta]').forEach(b=>b.onclick=async()=>{ const ok=b.dataset.o==='0'; b.classList.add(ok?'ok':'no'); if(ok){ tone(784,.25); tone(1047,.35,'triangle',.1); await saveActivity({score:1,total:1,answers:[+b.dataset.ta,0]},'Try & Answer') } else { tone(196,.4,'sawtooth'); toast('Not quite — a shorter string or a tighter skin makes a HIGHER sound.') } });
  $$('#insts [data-photo]').forEach(b=>b.onclick=()=>saveActivity({score:2,total:2,answers:[+b.dataset.photo]},'Photo')) }
renderInst();
$$('#halls .cat').forEach(b=>b.onclick=()=>{ $$('#halls .cat').forEach(c=>c.classList.toggle('on',c===b)); $$('.hall').forEach(h=>h.hidden=h.id!==b.dataset.hall); if(b.dataset.hall!=='h-lab') stopMic(); if(b.dataset.hall==='h-pass') renderPassport() });
/* Physics Quiz */
let qi=0,score=0,qAns=[],pendingQuiz=null;
async function saveQuiz(r){ if(!me()) return false; try{ await store.saveQuiz(r); return true }catch(err){ toast(err.message); return false } }
async function renderQuiz(){ const box=$('#quiz');
  if(qi>=QUIZ.length){ const r={score,total:QUIZ.length,answers:[...qAns]}; const saved=await saveQuiz(r); if(!saved) pendingQuiz=r; else renderPassport();
    const pass=score>=2;
    box.innerHTML=`<div class="empty"><div style="font-size:56px">${pass?'🏆':'📏'}</div><h3 style="font-family:Fredoka;font-size:26px">You scored ${score}/${QUIZ.length}</h3><p>${pass?'Great! You get Sticker 5 — Physics Quiz.':'Nice try — you need 2/3. Read the instrument cards in Zone A and play again!'}</p>
     <p style="margin-top:8px;font-weight:700">${saved?'✅ Saved to your passport.':'Your result is not saved yet.'}</p>
     <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap">${saved?'':'<button class="btn primary" id="qsave">Log in to save my result</button>'}<button class="btn ghost" id="qre">Play again</button></div></div>`;
    $('#qre').onclick=()=>{qi=0;score=0;qAns=[];pendingQuiz=null;renderQuiz()};
    if($('#qsave')) $('#qsave').onclick=()=>openAuth('login',async()=>{ if(pendingQuiz&&await saveQuiz(pendingQuiz)){ pendingQuiz=null; toast('✅ Quiz result saved'); $('#qsave')?.remove(); renderPassport() } });
    if(pass) confetti(); return }
  const q=QUIZ[qi]; box.innerHTML=`<p style="font-weight:800;color:var(--lilac)">PHYSICS QUIZ · Sticker 5 · Question ${qi+1} of ${QUIZ.length}</p><h3 style="font-family:Fredoka;font-size:22px;margin:4px 0 8px">${q[0]}</h3><div class="quiz">${q[1].map((o,i)=>`<button class="qopt" data-o="${i}">${String.fromCharCode(65+i)}. ${o}</button>`).join('')}</div>${me()?'':'<p class="hint">Tip: log in so your result counts on your passport.</p>'}`;
  $$('#quiz .qopt').forEach(b=>b.onclick=()=>{ const pick=+b.dataset.o, ok=pick===q[2]; qAns.push(pick); if(ok){score++;tone(784,.3);tone(1047,.4,'triangle',.12)} else tone(196,.4,'sawtooth'); $$('#quiz .qopt').forEach((x,i)=>{x.disabled=true; if(i===q[2]) x.classList.add('ok')}); if(!ok) b.classList.add('no'); setTimeout(()=>{qi++;renderQuiz()},900) }) }
/* Digital Stage Lab: Beat Light (Input → Processing → Output) */
let mic=null, micRaf=null, lit=0;
const thrPct=()=>+$('#sens').value;
function flash(level){ const on=level>=thrPct(); $('#bulb').classList.toggle('on',on); $('#ipoIn').classList.toggle('hot',level>8); $('#ipoPr').classList.toggle('hot',level>8); $('#ipoOut').classList.toggle('hot',on); return on }
function showLevel(p){ $('#lvl').style.width=Math.min(100,p)+'%'; $('#thr').style.left=`calc(${thrPct()}% - 2px)` }
$('#sens').oninput=()=>showLevel(0);
$('#clapBtn').onclick=()=>{ tone(140,.12,'square'); let p=92; showLevel(p); flash(p); setTimeout(()=>{ showLevel(0); flash(0) },180); $('#lvlTxt').textContent='👏 Clap! Light '+(92>=thrPct()?'ON':'stays OFF — sensitivity too low') };
async function startMic(){ try{ const a=ac(); const st=await navigator.mediaDevices.getUserMedia({audio:true}); const src=a.createMediaStreamSource(st), an=a.createAnalyser(); an.fftSize=1024; src.connect(an); const buf=new Float32Array(an.fftSize);
    mic={st,src,an}; $('#micBtn').textContent='⏹ Stop microphone';
    const loop=()=>{ an.getFloatTimeDomainData(buf); let sum=0; for(const v of buf) sum+=v*v; const rms=Math.sqrt(sum/buf.length); const p=Math.max(0,Math.min(100,(20*Math.log10(rms+1e-6)+60)*1.6)); showLevel(p); const on=flash(p); if(on) lit++; $('#lvlTxt').textContent=`Level ${Math.round(p)} · threshold ${thrPct()}`; micRaf=requestAnimationFrame(loop) }; loop() }
  catch(e){ toast(e.name==='NotAllowedError'?'Microphone blocked — use “Tap to clap” instead.':'Microphone not available — use “Tap to clap”.') } }
function stopMic(){ if(!mic) return; cancelAnimationFrame(micRaf); mic.st.getTracks().forEach(t=>t.stop()); mic=null; $('#micBtn').textContent='🎤 Use microphone'; showLevel(0); flash(0) }
$('#micBtn').onclick=()=>mic?stopMic():startMic();
showLevel(0);
function renderLabQuiz(){ const box=$('#labQuiz'); const pick=Array(LAB.length).fill(null);
  box.innerHTML=`<p style="font-weight:800;color:var(--lilac)">DIGITAL STAGE LAB · Sticker 6 (3/4 or more)</p>${LAB.map((q,i)=>`<div style="margin:10px 0"><b>${i+1}. ${q[0]}</b><div class="pledges" style="margin-top:6px">${q[1].map((o,k)=>`<button class="pledge" data-lq="${i}" data-o="${k}">${o}</button>`).join('')}</div></div>`).join('')}
   <div class="actions"><span id="labMsg" style="font-weight:800"></span><button class="btn primary" id="labSubmit">Check my answers</button></div>`;
  $$('#labQuiz [data-lq]').forEach(b=>b.onclick=()=>{ pick[+b.dataset.lq]=+b.dataset.o; $$(`#labQuiz [data-lq="${b.dataset.lq}"]`).forEach(x=>x.classList.toggle('on',x===b)) });
  $('#labSubmit').onclick=async()=>{ if(pick.includes(null)) return toast('Please answer all 4 questions'); const sc=pick.reduce((a,p,i)=>a+(p===LAB[i][2]?1:0),0);
    $$('#labQuiz [data-lq]').forEach(b=>{ const i=+b.dataset.lq,k=+b.dataset.o; if(k===LAB[i][2]) b.style.borderColor='var(--mint)'; else if(pick[i]===k) b.style.borderColor='var(--pink)' });
    $('#labMsg').textContent=`${sc}/4 ${sc>=3?'— Sticker 6 ✓':'— 3/4 needed, try again'}`; if(sc>=3) confetti(); await saveActivity({score:sc,total:4,answers:pick},'Digital Stage Lab') } }
renderLabQuiz();
/* Concert Passport */
function renderPassport(){ const box=$('#passport'); if(!box) return; const u=me();
  if(!u){ box.innerHTML=`<div class="empty"><div style="font-size:52px">🏅</div><h3 style="font-family:Fredoka">Concert Passport</h3><p>Log in to see your stickers: Check-in, Sing &amp; Fill, Photo, Try &amp; Answer, Physics Quiz and Digital Stage Lab.</p><button class="btn primary" style="margin-top:12px" data-act="login">Log in</button></div>`; return }
  const P=stickersFor(store.myTickets().filter(t=>t.evId==='main'),store.myQuiz()), tk=store.myTickets().find(t=>t.evId==='main'&&t.status!=='cancelled');
  box.innerHTML=`<h3 style="font-family:Fredoka;font-size:24px">MUSIC FOR CHANGE – CONCERT PASSPORT</h3><p style="color:var(--ink2)">One notebook, one smile — 10C9, Nguyen Van Linh High School</p>
   <div class="kv" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0;font-size:14px"><div>Name<br><b>${esc(u.name)}</b></div><div>Class<br><b>${esc(u.cls)||'—'}</b></div><div>Ticket<br><b>${tk?esc(tk.type):'No ticket yet'}</b></div><div>Seat<br><b>${tk?esc(tk.seats):'—'}</b></div></div>
   <div class="stickers">${P.list.map(x=>`<div class="stk ${x.got?'got':''}"><span class="n">${x.got?'✅':x.n}</span><b>${x.label}</b><small>${x.how}</small></div>`).join('')}<div class="stk"><span class="n">★</span><b>Bonus</b><small>Ask the band a question in English (optional)</small></div></div>
   <div class="note-box" style="font-size:15px">RESULT: <b>${P.completed?'🎉 COMPLETED (6/6)':`NOT COMPLETED YET (${P.count}/6)`}</b>${tk?'':' · <a href="#ticketbox">Get your ticket</a>'}</div>` }

/* ====== MERCH ====== */
let mcat='All'; const msel={};
function renderMerch(){ const wish=store?store.myWish():[];
  $('#mcats').innerHTML=['All','Light','Paper','VIP'].map(c=>`<button class="cat ${c===mcat?'on':''}" data-c="${c}">${c}</button>`).join('')+`<span class="cat" style="margin-left:auto;cursor:default">🎒 My kit list: ${wish.length}</span>`;
  $$('#mcats [data-c]').forEach(b=>b.onclick=()=>{mcat=b.dataset.c;renderMerch()});
  $('#mgrid').innerHTML=MERCH.map((m,i)=>({m,i})).filter(({m})=>mcat==='All'||m.c===mcat).map(({m,i})=>{ const col=msel[i]??m.sw[0], inW=wish.includes(m.n), l=merchLeft(m.n); return `<div class="mcard" id="m-${i}"><div class="pic" style="--bgc:${m.bgc}"><span class="stock" style="${l?'':'color:#d6285a'}">${l?l+' left':'Out of stock'}</span><svg viewBox="0 0 160 150" width="170" height="160">${m.svg(col)}</svg></div><div class="b"><h4>${m.label}</h4><p>${m.d}</p><div class="swatches">${m.sw.map(s=>`<button class="sw ${s===col?'on':''}" style="background:${s}" data-act="swatch" data-m="${i}" data-s="${s}" aria-label="colour"></button>`).join('')}</div><div style="display:flex;justify-content:space-between;align-items:center"><b style="color:var(--mint)">${m.c==='Light'?'Borrowed · please return':m.c==='VIP'?'For VIP guests':'Free with your ticket'}</b><button class="heart ${inW?'on':''}" data-act="wish" data-w="${m.n}">${inW?'✓ On my list':'+ My kit list'}</button></div></div></div>` }).join('') }

/* ====== CONTACT ====== */
$('#cform').onsubmit=e=>{ e.preventDefault(); const txt=`To: 10C9 Music Concert team\nTopic: ${$('#ctopic').value}\nFrom: ${$('#cname').value}${$('#crole').value?' ('+$('#crole').value+')':''}\n\n${$('#cmsg').value}`;
  $('#cout').innerHTML=`<p style="margin-top:16px;font-weight:700">Your message is ready. Copy it and send it to your class representative or homeroom teacher:</p><div class="msgout">${esc(txt)}</div><button class="btn ghost" style="margin-top:10px" id="cpy">📋 Copy message</button>`;
  $('#cpy').onclick=async()=>{ try{ await navigator.clipboard.writeText(txt); toast('Copied!') }catch(err){ toast('Please select the text and copy it') } } };

/* ====== ADMIN DASHBOARD ====== */
const adm={tab:'checkin',ev:'main',q:'',note:'',open:{},code:'',scanning:false,scanErr:''};
const meter=p=>`<div class="meter" title="${Math.round(p)}%"><i style="width:${Math.max(0,Math.min(100,p))}%"></i></div>`;
const kpi=(l,v,s,p)=>`<div class="kpi"><span>${l}</span><b class="num">${v}</b><small>${s}</small>${p!=null?meter(p):''}</div>`;
const pct=(a,b)=>b?a/b*100:0;
function renderAdmin(){ if(!isAdmin()) return;
  if(adm.tab!=='checkin'&&adm.scanning){ stopScanner(); adm.scanning=false }
  const tabs=[['checkin','📲 Check-in (scan QR)'],['overview','📊 Overview'],['users','👥 Users'],['tickets','🎫 Tickets & Seats'],['quiz','❓ Activity results'],['merch','🛍️ Concert kit']];
  $('#admTabs').innerHTML=tabs.map(t=>`<button class="cat ${adm.tab===t[0]?'on':''}" data-act="admtab" data-t="${t[0]}">${t[1]}</button>`).join('');
  $('#admBody').innerHTML=({checkin:admCheckin,overview:admOverview,users:admUsers,tickets:admTickets,quiz:admQuiz,merch:admMerch})[adm.tab]();
  if(adm.tab==='checkin') bindCheckin() }

const userTickets=uid=>store.tickets().filter(t=>t.uid===uid&&t.evId==='main');
const passportOf=uid=>stickersFor(userTickets(uid),store.quiz().filter(q=>q.uid===uid));
function nbTotals(){ const T=store.tickets().filter(t=>t.evId==='main'); const live=T.filter(t=>t.status!=='cancelled'), ch=T.filter(t=>t.status==='checked');
  return {expected:live.reduce((a,t)=>a+nbOf(t),0), received:ch.reduce((a,t)=>a+nbOf(t),0), guests:ch.reduce((a,t)=>a+t.qty,0), booked:live.reduce((a,t)=>a+t.qty,0)} }

/* ---- Check-in: scan the guest's QR with the phone/laptop camera ---- */
function admCheckin(){ const N=nbTotals(), code=adm.code, t=code?store.tickets().find(x=>x.code===code):null;
  let res='';
  if(code&&!t) res=`<div class="result bad"><h4>❌ Invalid ticket</h4><p>Code <b>${esc(code)}</b> was not found. Ask the guest to open “My Tickets”, or register them again.</p></div>`;
  else if(t){ const st=t.status, cls=st==='active'?'ok':st==='checked'?'warn':'bad';
    res=`<div class="result ${cls}"><h4>${st==='active'?'✅ Valid ticket':st==='checked'?'⚠️ Already checked in':'❌ Cancelled ticket'}</h4>
     <div class="kv"><div>Guest<b>${esc(t.name)}</b></div><div>Class / role<b>${esc(t.cls)||'—'}</b></div><div>When<b>${esc(t.when)}</b></div><div>Ticket<b>${esc(t.type)}</b></div><div>Seat(s)<b>${esc(t.seats)}</b></div><div>Bring<b>📚 ${nbOf(t)} notebook${nbOf(t)>1?'s':''}</b></div><div>Photo<b>${/No/.test(t.pledge)?'<span class="reddot"></span>No — red dot on passport':/Yes/.test(t.pledge)?'Yes':'—'}</b></div></div>
     <p style="font-size:13px;color:var(--ink2)">Code ${t.code} · @${esc(t.u)}</p>
     <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">${st==='active'?`<button class="btn primary" data-act="doCheckin" data-code="${t.code}">✅ Received ${nbOf(t)} notebook${nbOf(t)>1?'s':''} · Check in</button>`:''}${st==='checked'?`<button class="btn ghost" data-act="tkstatus" data-code="${t.code}" data-s="active">Undo check-in</button>`:''}<button class="btn ghost" data-act="scanNext">Next guest →</button></div></div>` }
  return `<div class="kpis">${kpi('Guests checked in',N.guests,`of ${N.booked} tickets booked`,pct(N.guests,N.booked))}${kpi('📚 Notebooks received',N.received,`of ${N.expected} expected`,pct(N.received,N.expected))}${kpi('Still to arrive',Math.max(0,N.booked-N.guests),'guests')}</div>
  <div class="scan-wrap"><div><div class="scanner" id="scanBox">${adm.scanning?'':`<div style="padding:20px"><div style="font-size:48px">📷</div><p>Point the camera at the guest's QR code.</p></div>`}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="btn primary" data-act="scanToggle">${adm.scanning?'⏹ Stop camera':'📷 Start camera'}</button></div>
    ${adm.scanErr?`<p class="err" style="margin-top:8px">${esc(adm.scanErr)}</p>`:''}
    <form id="codeForm" class="toolbar" style="margin-top:12px"><input id="codeIn" placeholder="…or type the code, e.g. 10C9-AB12-XYZ" style="flex:1;min-width:200px" value="${esc(code)}"><button class="btn ghost xs" type="submit">Find</button></form></div>
   <div>${res||`<div class="result"><h4>Waiting for a ticket…</h4><p style="color:var(--ink2)">Rule (Math, propositions): <i>If you have a valid QR code, then you get a passport and a seat.</i> Each ticket can only be checked in once, so no guest is counted twice.</p></div>`}</div></div>` }
function lookup(raw){ const c=findCode(raw); adm.code=c||String(raw||'').trim().toUpperCase(); if(c) tone?.(880,.15); renderAdmin() }
function bindCheckin(){ const f=$('#codeForm'); if(f) f.onsubmit=e=>{ e.preventDefault(); lookup($('#codeIn').value) };
  if(adm.scanning&&!$('#scanBox video')) startScanner($('#scanBox'),txt=>{ if(findCode(txt)!==adm.code) lookup(txt) }).catch(err=>{ adm.scanning=false; adm.scanErr=err.message; renderAdmin() }) }

function admOverview(){
  const ALLU=store.users(), TK=store.tickets(), QZ=store.quiz(), WA=store.wishAll();
  const users=ALLU.filter(x=>x.role==='user').length, admins=ALLU.length-users;
  let iss=0,capT=0,seatIss=0,seatCap=0; BOOKABLE.forEach(e=>TYPES.forEach(t=>{ const i=issued(e.id,t.id),c=cap(e.id,t.id); iss+=i; capT+=c; if(t.seated){ seatIss+=i; seatCap+=c } }));
  const NB=nbTotals(), guests=[...new Set(TK.filter(t=>t.evId==='main'&&t.status==='checked').map(t=>t.uid))], done=guests.filter(uid=>passportOf(uid).completed).length, sf=QZ.filter(a=>a.total===6);
  const stock=MERCH.reduce((a,m)=>a+merchInv(m.n).stock,0), given=MERCH.reduce((a,m)=>a+merchInv(m.n).given,0);
  const wishes=Object.values(WA).reduce((a,l)=>a+l.length,0);
  const bookings=TK.filter(t=>t.status!=='cancelled').length, checked=TK.filter(t=>t.status==='checked').reduce((a,t)=>a+t.qty,0);
  return `<div class="kpis">
    ${kpi('Registered accounts',ALLU.length,`${users} users · ${admins} admins`)}
    ${kpi('Tickets issued',iss,`of ${capT} available (${Math.round(pct(iss,capT))}%) · ${bookings} bookings`,pct(iss,capT))}
    ${kpi('Seats taken',seatIss,`of ${seatCap} open seats (${Math.round(pct(seatIss,seatCap))}%)`,pct(seatIss,seatCap))}
    ${kpi('Checked in',checked,'guests at the entrance')}
    ${kpi('📚 Notebooks',NB.received,`received · ${NB.expected} expected from bookings`,pct(NB.received,NB.expected))}
    ${kpi('Passports completed',done,`of ${guests.length} checked-in guests (6/6)`,pct(done,guests.length))}
    ${kpi('Sing & Fill ≥ 4/6',sf.length?Math.round(pct(sf.filter(a=>a.score>=4).length,sf.length))+'%':'—',`${sf.length} answers`)}
    ${kpi('Concert kit handed out',given,`of ${stock} in stock · ${wishes} kit-list requests`,pct(given,stock))}
  </div>
  ${BOOKABLE.map(e=>`<div class="apanel"><h3>${e.t} — tickets by type</h3><div class="bars">${TYPES.map(t=>{ const i=issued(e.id,t.id),c=cap(e.id,t.id); return `<div class="bar-row" title="${t.name}: ${i} of ${c}"><span>${t.em} ${t.name}</span>${meter(pct(i,c))}<span class="num">${i}/${c}</span></div>` }).join('')}</div></div>`).join('')}
  <div class="apanel"><h3>Audience votes</h3><div class="bars">${ACTS.map(a=>{ const n=store.votes(a.id).length, mx=Math.max(1,...ACTS.map(x=>store.votes(x.id).length)); return `<div class="bar-row" title="${a.name}: ${n} votes"><span>${a.name}</span>${meter(pct(n,mx))}<span class="num">${n}</span></div>` }).join('')}</div></div>
  <div class="apanel"><h3>Danger zone</h3><p style="font-size:14px;color:var(--ink2);margin-bottom:10px">Clear all tickets, activity results, votes, kit lists, user accounts (admins are kept) and reset stock — e.g. after a rehearsal run. Do not use on concert day.</p><button class="btn danger xs" data-act="resetdemo" data-confirm="Tap again to reset everything">Reset event data</button></div>` }

function admUsers(){ const q=adm.q.toLowerCase(), self=me().id, ALLU=store.users(), TK=store.tickets(), QZ=store.quiz();
  const list=ALLU.filter(u=>!q||(u.u+' '+u.name+' '+u.cls).toLowerCase().includes(q));
  return `${adm.note?`<div class="adm-note">🔑 ${esc(adm.note)}</div>`:''}
  <div class="apanel"><h3>Add a user</h3><div class="addform">
    <input id="auName" placeholder="Full name"><input id="auCls" placeholder="Class / role"><input id="auUser" placeholder="username"><input id="auPass" placeholder="Password (min 6)" type="password">
    <select id="auRole"><option value="user">User</option><option value="admin">Admin</option></select><button class="btn primary xs" data-act="adduser">+ Add user</button></div></div>
  <div class="apanel"><div class="toolbar"><h3 style="margin:0">All accounts (${ALLU.length})</h3><input data-chg="admq" placeholder="Search name, username, class…" value="${esc(adm.q)}" style="margin-left:auto"></div>
  <table class="t"><thead><tr><th>User</th><th>Class / role</th><th>Role</th><th>Status</th><th>Tickets</th><th>Passport</th><th>Joined</th><th>Actions</th></tr></thead><tbody>
  ${list.map(u=>{ const tk=TK.filter(t=>t.uid===u.id&&t.status!=='cancelled').reduce((a,t)=>a+t.qty,0), qs=QZ.filter(x=>x.uid===u.id), best=qs.length?Math.max(...qs.map(x=>x.score)):null, isMe=u.id===self;
    return `<tr><td><b>${esc(u.name)}</b>${isMe?' <small>(you)</small>':''}<br><small style="color:var(--ink2)">@${esc(u.u)}</small></td><td>${esc(u.cls)||'—'}</td>
    <td><select data-chg="setrole" data-u="${u.id}" ${isMe?'disabled':''}><option value="user" ${u.role==='user'?'selected':''}>User</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select></td>
    <td><span class="status ${u.active?'st-active':'st-cancelled'}">${u.active?'Active':'Locked'}</span></td><td class="num">${tk}</td><td class="num">${passportOf(u.id).count}/6</td><td>${fmtDate(u.at)}</td>
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
  <table class="t"><thead><tr><th>Code</th><th>Guest</th><th>Type</th><th>Seats</th><th>📚</th><th>Photo</th><th>Booked</th><th>Status</th><th>Actions</th></tr></thead><tbody>
  ${rows.map(t=>`<tr><td><b>${t.code}</b></td><td>${esc(t.name)}<br><small style="color:var(--ink2)">@${esc(t.u)} · ${esc(t.cls)||'—'}</small></td><td>${esc(t.type)}</td><td>${esc(t.seats)}</td><td class="num">${nbOf(t)}</td><td><small>${/No/.test(t.pledge)?'<span class="reddot"></span>No':esc(t.pledge.replace('Photo: ',''))||'—'}</small></td><td>${fmtDate(t.at)}</td><td><span class="status st-${t.status}">${ST[t.status]}</span></td>
   <td><div style="display:flex;gap:6px;flex-wrap:wrap">${t.status==='active'?`<button class="btn ok xs" data-act="tkstatus" data-code="${t.code}" data-s="checked">Check in</button><button class="btn danger xs" data-act="tkstatus" data-code="${t.code}" data-s="cancelled" data-confirm="Sure?">Cancel</button>`:''}${t.status!=='active'?`<button class="btn ghost xs" data-act="tkstatus" data-code="${t.code}" data-s="active">${t.status==='checked'?'Undo check-in':'Restore'}</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="9" class="empty">No bookings yet</td></tr>'}
  </tbody></table></div>` }

function admQuiz(){ const A=store.quiz(), by=k=>A.filter(a=>a.total===k), sfA=by(6), phA=by(3), lbA=by(4), taA=by(1), poA=by(2);
  const rate=(arr,min)=>arr.length?Math.round(pct(arr.filter(a=>a.score>=min).length,arr.length))+'%':'—';
  const bars=(arr,items,correct)=>`<div class="bars">${items.map((label,i)=>{ const c=arr.filter(a=>a.answers[i]===correct(i)).length; return `<div class="bar-row" title="${c} of ${arr.length} correct"><span>${label}</span>${meter(pct(c,arr.length))}<span class="num">${arr.length?Math.round(pct(c,arr.length))+'%':'—'}</span></div>` }).join('')}</div>`;
  const detail=a=>a.total===6?LYRICS.map((l,i)=>l.includes(`{${i}}`)?`${a.answers[i]===i?'✅':'❌'} (${i+1}) ${esc(WORDS[a.answers[i]]??'—')}${a.answers[i]===i?'':` · correct: <b>${WORDS[i]}</b>`}`:'').filter(Boolean).join('<br>')
    :a.total===3?QUIZ.map((q,i)=>`${a.answers[i]===q[2]?'✅':'❌'} Q${i+1}. ${esc(q[0])} — ${esc(q[1][a.answers[i]]??'—')}`).join('<br>')
    :a.total===4?LAB.map((q,i)=>`${a.answers[i]===q[2]?'✅':'❌'} ${esc(q[0])} — ${esc(q[1][a.answers[i]]??'—')}`).join('<br>')
    :a.total===1?`Played the ${INST[a.answers[0]]?.n||'instrument'} and answered correctly`:`Photo with the ${INST[a.answers[0]]?.n||'instrument'}`;
  return `<div class="kpis">${kpi('Sing & Fill',sfA.length,`answers · ${rate(sfA,4)} got 4/6 or more`)}${kpi('Physics Quiz',phA.length,`answers · ${rate(phA,2)} got 2/3 or more`)}${kpi('Digital Stage Lab',lbA.length,`answers · ${rate(lbA,3)} got 3/4 or more`)}${kpi('Try & Answer · Photo',`${taA.length} · ${poA.length}`,'Zone A stickers')}</div>
  <div class="apanel"><h3>Sing & Fill — correct answers by blank</h3>${bars(sfA,WORDS.slice(0,6).map((w,i)=>`(${i+1}) ${w}`),i=>i)}</div>
  <div class="apanel"><h3>Physics Quiz — correct answers by question</h3>${bars(phA,QUIZ.map((q,i)=>`Q${i+1}. ${esc(q[0])}`),i=>QUIZ[i][2])}</div>
  <div class="apanel"><h3>Digital Stage Lab — correct answers</h3>${bars(lbA,LAB.map(q=>esc(q[0])),i=>LAB[i][2])}</div>
  <div class="apanel"><h3>All results</h3><table class="t"><thead><tr><th>When</th><th>Activity</th><th>User</th><th>Class / role</th><th>Score</th><th></th></tr></thead><tbody>
  ${A.map((a,k)=>`<tr><td>${fmtDate(a.at)}</td><td>${KIND[a.total]||'Quiz'}</td><td><b>${esc(a.name)}</b> <small style="color:var(--ink2)">@${esc(a.u)}</small></td><td>${esc(a.cls)||'—'}</td><td class="num">${a.score}/${a.total}</td><td><button class="btn ghost xs" data-act="qdetail" data-i="${k}">${adm.open[k]?'Hide':'View answers'}</button></td></tr>
   ${adm.open[k]?`<tr class="detail"><td colspan="6">${detail(a)}</td></tr>`:''}`).join('')||'<tr><td colspan="6" class="empty">No results yet</td></tr>'}
  </tbody></table></div>` }

function admMerch(){ const totalS=MERCH.reduce((a,m)=>a+merchInv(m.n).stock,0), totalG=MERCH.reduce((a,m)=>a+merchInv(m.n).given,0);
  const wishers=n=>Object.entries(store.wishAll()).filter(([u,l])=>l.includes(n)).map(([u])=>u);
  return `<div class="kpis">${kpi('Total stock',totalS,'items across the collection')}${kpi('Given out',totalG,`${Math.round(pct(totalG,totalS))}% of stock`,pct(totalG,totalS))}${kpi('Remaining',totalS-totalG,'items left to give')}</div>
  <div class="apanel"><h3>Stock & giveaways</h3><table class="t"><thead><tr><th>Item</th><th>Stock (edit)</th><th>Given out</th><th>Remaining</th><th style="width:18%">Given</th><th>Requested by</th></tr></thead><tbody>
  ${MERCH.map((m,i)=>{ const inv=merchInv(m.n), w=wishers(m.n); return `<tr><td><b>${m.label}</b><br><small style="color:var(--ink2)">${m.c}</small></td><td><input type="number" id="stk-${i}" min="${inv.given}" value="${inv.stock}"></td>
    <td><div style="display:flex;align-items:center;gap:6px"><button class="btn ghost xs" data-act="give" data-n="${m.n}" data-d="-1">−</button><span class="num" style="min-width:28px;text-align:center">${inv.given}</span><button class="btn ok xs" data-act="give" data-n="${m.n}" data-d="1">+1</button></div></td>
    <td class="num">${inv.stock-inv.given}</td><td>${meter(pct(inv.given,inv.stock))}</td>
    <td>${w.length?`<div class="chips">${w.map(u=>`<span class="uchip">@${esc(userName(u))} <button class="btn ok xs" data-act="givewish" data-n="${m.n}" data-u="${u}" title="Give this item and remove it from their kit list">Give</button></span>`).join('')}</div>`:'<small style="color:var(--ink2)">—</small>'}</td></tr>` }).join('')}
  </tbody></table><div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;flex-wrap:wrap;gap:10px"><small style="color:var(--ink2)">Use +1 at the check-in desk each time an item is handed out (− when a light stick comes back). "Give" also clears it from that guest's kit list.</small><button class="btn primary xs" data-act="savestock">💾 Save stock</button></div></div>` }

/* ====== SEARCH ====== */
const INDEX=[...ACTS.map(a=>({t:a.name,s:a.group+' · '+a.genre,i:'🎤',go:'performance',el:'act-'+a.id})),...INST.map((x,i)=>({t:x.n,s:'Instrument Museum · '+x.o,i:'🎸',go:'museum',hall:'h-inst',el:'inst-'+i})),{t:'Physics Quiz',s:'Sticker 5',i:'❓',go:'museum',hall:'h-quiz'},{t:'Beat Light · Digital Stage Lab',s:'Sticker 6',i:'💡',go:'museum',hall:'h-lab'},{t:'Concert Passport',s:'My stickers',i:'🏅',go:'museum',hall:'h-pass'},{t:'Sing & Fill',s:'Sticker 2',i:'🎶',go:'performance',el:'singfill'},...MERCH.map((m,i)=>({t:m.label,s:'Concert kit · '+m.c,i:'🛍️',go:'merch',el:'m-'+i})),...EVENTS.map(e=>({t:e.t,s:e.m,i:'🎫',go:e.book?'ticketbox':e.go,ev:e.book?e.id:null}))];
$('#q').oninput=e=>{ const v=e.target.value.trim().toLowerCase(), r=$('#results'); if(!v){ r.classList.remove('show'); return }
  const hits=INDEX.filter(x=>(x.t+' '+x.s).toLowerCase().includes(v)).slice(0,7);
  r.innerHTML=hits.length?hits.map((h,k)=>`<button data-h="${k}"><span>${h.i}</span><span>${h.t}<br><small>${h.s}</small></span></button>`).join(''):'<div style="padding:12px 16px;color:var(--ink2)">No results</div>'; r.classList.add('show');
  $$('#results [data-h]').forEach(b=>b.onclick=()=>{ const h=hits[+b.dataset.h]; r.classList.remove('show'); $('#q').value=''; go(h.go); if(h.ev) pickEvent(h.ev);
    if(h.hall) $(`#halls [data-hall="${h.hall}"]`).click(); if(h.go==='performance'){ genre='All'; renderPerf() } if(h.go==='merch'){ mcat='All'; renderMerch() }
    if(h.el) setTimeout(()=>{ const el=document.getElementById(h.el); if(el){ el.scrollIntoView({behavior:'smooth',block:'center'}); el.animate([{transform:'scale(1)'},{transform:'scale(1.05)'},{transform:'scale(1)'}],{duration:600}) } },350) }) };

/* ====== START ====== */
function renderAll(){ renderHeader(); renderNb(); renderEvents(); renderTB(); renderPerf(); renderMerch(); renderPassport(); if($('#admin').classList.contains('active')) renderAdmin() }
// A ticket QR opens  <site>/?ticket=CODE  — staff (admin) go straight to check-in; guests see their ticket.
async function openTicketLink(code){ history.replaceState(null,'',location.pathname+(location.hash||'#home'));
  if(isAdmin()){ adm.tab='checkin'; adm.code=code; go('admin'); return }
  const staffBtn=`<div style="text-align:center;margin-top:14px"><button class="btn ghost xs" data-act="staffLogin" data-code="${esc(code)}">Staff: log in to check in</button></div>`;
  let t=store?.myTickets().find(x=>x.code===code)||null, err='';
  if(!t){ try{ t=await store.getTicketByCode(code) }catch(e){ err=e.message } }
  $('#tixList').innerHTML=t?ticketHTML(t)+`<p style="text-align:center;margin-top:12px;color:var(--ink2);font-size:14px">Show this ticket at the check-in desk.</p>`+(me()?'':staffBtn)
    :`<div class="empty"><div style="font-size:52px">❌</div><h3 style="font-family:Fredoka">Ticket not found</h3><p>${esc(err)||`The code ${esc(code)} does not match any ticket.`}</p></div>`+staffBtn;
  $('#tixModal').classList.add('show') }
(async()=>{
  try{ store=await createStore(); await store.init() }
  catch(err){ console.error(err); toast(err.message||'Could not load data') }
  if(store?.mode==='unconfigured'){ const bar=document.createElement('div'); bar.setAttribute('role','alert');
    bar.style.cssText='background:#2b2350;color:#ffc93c;text-align:center;padding:10px 16px;font-weight:700;font-size:14px';
    bar.textContent='⚠️ '+NOT_CONFIGURED_MESSAGE; document.body.prepend(bar) }
  renderQuiz(); renderSingFill(); renderAll(); go(location.hash.slice(1)||'home');
  const tk=findCode(new URLSearchParams(location.search).get('ticket')); if(tk) await openTicketLink(tk);
  // keep numbers fresh when the tab is shown again (e.g. admin dashboard on the entrance laptop)
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&store&&!busy) store.refresh().then(renderAll).catch(()=>{}) });
})();