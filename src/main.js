import {gsap} from 'gsap';
import {Chart} from 'chart.js';
import {authRequest,db,rememberSession,result,scope} from './data.js';
import {action,el,empty,field,form,heading,icon,modal,panel,toast} from './ui.js';
import {balance,day,money,sum} from './core.js';
import * as modules from './modules.js';
import './style.css';

const app=document.querySelector('#app');
const routes={
 dashboard:['Layout dashboard','layout-dashboard','İdarəetmə mərkəzi'],
 wallet:['Wallet','wallet','Maliyyə'],
 chat:['Chat','messages-square','Mesajlar'],
 drive:['Drive','folder-open','Fayllar'],
 tasks:['Tasks','list-todo','Tapşırıqlar'],
 projects:['Projects','layers','Layihələr'],
 notes:['Notes','notebook-pen','Qeydlər'],
 calendar:['Calendar','calendar-days','Təqvim'],
 arena:['Arena','trophy','Nailiyyətlər'],
 vibes:['Vibes','headphones','Əyləncə'],
 notifications:['Bildirişlər','bell','Bildiriş mərkəzi'],
 'pc-monitor':['PC Monitor','activity','Cihaz telemetriyası'],
 ai:['Duo AI','sparkles','Şəxsi köməkçi'],
 settings:['Ayarlar','settings','Profil və workspace']
};
const name=heading('strong','DUO SPACE','brand');
const brand=()=>el('div',{class:'logo'},el('span',{class:'logo-mark'},icon('orbit')),name.cloneNode(true));
const route=()=>Object.hasOwn(routes,location.hash.slice(1))?location.hash.slice(1):'dashboard';
let ctx,workspace,outlet,connection,ticker,heartbeat,subscription,renderId=0,bootId=0,schedule;
let lastRoute,dirty=false;
function show(content){
  app.replaceChildren(content);
  app.setAttribute('aria-busy','false');
}
function login(){
  const authForm=form([
    field('username','İstifadəçi adı','text','',{required:true,autocomplete:'username',maxlength:32}),
    field('password','Şifrə','password','',{required:true,autocomplete:'current-password',maxlength:128}),
    field('code','Giriş kodu','password','',{required:true,autocomplete:'off',maxlength:256}),
    field('remember','Yadda saxla','checkbox')
  ],async ({remember,...values})=>{
    const session=await authRequest('/api/login',values);
    rememberSession(Boolean(remember));
    await result(db.auth.setSession(session));
  },'Daxil ol');
  show(el('main',{class:'entry'},el('section',{class:'entry-hero'},brand(),
    heading('p','ŞƏXSİ İDARƏETMƏ MƏRKƏZİ','eyebrow'),
    el('h1',{},'İki nəfər.',el('br'),'Bir məkan.'),
    heading('p','Maliyyə, söhbətlər və gündəlik planlarınız bir yerdə.','lede'),
    el('div',{class:'orbit-art','aria-hidden':'true'},el('i'),el('i'),el('i'))),
    el('section',{class:'entry-side'},panel('Workspace-ə giriş',
      heading('p','Giriş dəvət olunan üzvlər üçündür.','muted'),
      db?authForm:empty('Supabase bağlantısı qurulmayıb. Quraşdırma addımları README faylındadır.')))));
}
function join(user){
  show(el('main',{class:'onboarding'},brand(),
    user.app_metadata?.duo_admin === true
      ? panel('Yeni workspace',form([field('label','Ad','text','',{required:true,maxlength:80})],async values=>{
        await result(db.rpc('create_workspace',values));await boot(user);
      },'Workspace yarat'))
      : panel('Workspace',empty('Hesabınızı workspace-ə admin əlavə edir.')),
    action('Çıxış',()=>result(db.auth.signOut()))));
}
async function preferences(){
  ctx.prefs=(await ctx.rows('user_settings'))[0];
  const accent=ctx.prefs?.accent;
  document.documentElement.style.setProperty('--accent',/^#[\da-f]{6}$/i.test(accent??'')?accent:'#9b7bff');
}
async function updatePrefs(values){
  await ctx.write('user_settings',values,ctx.prefs?.id);
  await preferences();
  await render();
}
const clock=()=>new Intl.DateTimeFormat('az-AZ',{dateStyle:'full',timeStyle:'medium',timeZone:'Asia/Baku'}).format(new Date());
function connected(label){
  if(connection) connection.textContent=label;
}
function shell(){
  const list=el('nav',{'aria-label':'Əsas naviqasiya'},Object.entries(routes).map(([key,[label,glyph]])=>el('a',{href:'#'+key,'data-route':key},icon(glyph),label)));
  const side=el('aside',{class:'sidebar'},brand(),el('div',{class:'workspace'},icon('orbit'),workspace.name),list,el('footer',{},action('Çıxış',()=>result(db.auth.signOut()))));
  connection=heading('span','Bağlantı yoxlanır','connection');
  outlet=el('main',{id:'main',tabindex:'-1'});
  show(el('div',{class:'shell'},side,el('div',{class:'content'},el('header',{class:'topbar'},
    el('div',{class:'actions'},action('Menyu',()=>side.classList.toggle('open'),'menu'),connection),
    el('div',{class:'actions'},action('Axtar · Ctrl K',palette),heading('span',(ctx.me?.username??'Üzv').slice(0,2).toUpperCase(),'avatar'))),outlet)));
  list.addEventListener('click',()=>side.classList.remove('open'));
}
function palette(){
  if(!ctx) return;
  const list=el('div',{class:'palette-list'});
  const items=Object.entries(routes).map(([key,[label,glyph,description]])=>({key,label,glyph,description}));
  const input=el('input',{type:'search',placeholder:'Bölmə və ya qeyd axtar','aria-label':'Axtar'});
  const dialog=modal('Sürətli axtarış',el('div',{},input,list));
  let timer,revision=0;
  const draw=()=>{
    const query=input.value.trim().toLowerCase();
    const id=++revision;
    clearTimeout(timer);
    list.replaceChildren(...items.filter(i=>(i.label+' '+i.description).toLowerCase().includes(query))
      .map(i=>el('a',{href:'#'+i.key,onclick:()=>dialog.close()},icon(i.glyph),i.label)));
    if(query.length<2) return;
    timer=setTimeout(async()=>{
      try{
        const term='%'+query.replace(/[\\%_]/g,'\\$&')+'%';
        const results=await Promise.all([['tasks','tasks'],['notes','notes'],['files','drive'],['expenses','wallet'],['messages','chat']].map(async ([table,key])=>{
          const column=table==='messages'?'body':'title';
          const rows=await result(db.from(table).select(column).eq('workspace_id',ctx.workspace).ilike(column,term).limit(5));
          return rows.map(r=>el('a',{href:'#'+key,onclick:()=>dialog.close()},r[column].slice(0,80)));
        }));
        if(id===revision && dialog.open) list.append(...results.flat());
      }catch(error){if(dialog.open) toast(error.message);}
    },300);
  };
  input.addEventListener('input',draw);
  draw();input.focus();
}
document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();palette();}
});
async function dashboard(){
  const [expenses,tasks,messages,files,settlements]=await Promise.all(['expenses','tasks','messages','files','settlements'].map(t=>ctx.rows(t,q=>['files','messages'].includes(t)?q.limit(6):q)));
  const today=day(),month=expenses.filter(r=>r.day.startsWith(today.slice(0,7)));
  const done=tasks.filter(t=>t.status==='done').length;
  const partner=ctx.people.find(p=>p.id!==ctx.user);
  const status=partner?.last_seen&&Date.now()-Date.parse(partner.last_seen)<95000?'Onlayn':partner?.last_seen?'Son giriş · '+new Date(partner.last_seen).toLocaleString('az-AZ'):'Oflayn';
  const cards={
    finance:panel('Maliyyə icmalı',heading('div',money(sum(month)),'metric'),heading('p','Bu gün '+money(sum(expenses.filter(r=>r.day===today)))+' · Ortaq '+money(sum(month.filter(r=>r.shared)))+' · Balans '+money(balance(expenses,settlements,ctx.user)),'muted'),modules.chart(month)),
    tasks:panel('Tapşırıqlar',heading('div',done+' / '+tasks.length,'metric'),el('progress',{value:done,max:Math.max(1,tasks.length),'aria-label':'Tamamlanma'}),
      heading('p',tasks.filter(t=>t.due===today).length+' bu gün · '+tasks.filter(t=>t.due&&t.due<today&&t.status!=='done').length+' gecikib','muted')),
    activity:panel('Son fəaliyyət',...[
      ...messages.map(r=>({...r,text:'Mesaj · '+r.body.slice(0,70)})),
      ...files.map(r=>({...r,text:'Fayl · '+r.title})),
      ...tasks.slice(0,5).map(r=>({...r,text:'Tapşırıq · '+r.title})),
      ...expenses.slice(0,5).map(r=>({...r,text:'Xərc · '+r.title}))
    ].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,7).map(r=>heading('p',r.text,'feed')),
    !messages.length&&!files.length&&!tasks.length&&!expenses.length?empty():null),
    quick:panel('Sürətli əməliyyatlar',el('div',{class:'quick'},[
      ['wallet','Xərc əlavə et',()=>modules.edit(ctx,'expenses')],['chat','Mesaj yaz'],['drive','Fayl yüklə'],
      ['tasks','Tapşırıq yarat',()=>modules.edit({...ctx,projects:[]},'tasks')],['notes','Qeyd yarat',()=>modules.edit(ctx,'notes')],
      ['calendar','Hadisə yarat',()=>modules.edit(ctx,'calendar_events')]
    ].map(([key,label,fn])=>fn?action(el('span',{},icon(routes[key][1]),label),fn):el('a',{href:'#'+key},icon(routes[key][1]),label))))
  };
  const order=[...new Set([...(ctx.prefs?.dashboard_order??[]),...Object.keys(cards)])].filter(k=>Object.hasOwn(cards,k));
  const grid=el('div',{class:'grid'},order.map((key,index)=>{
    cards[key].prepend(el('div',{class:'card-tools'},index>0?action('↑',()=>{[order[index-1],order[index]]=[order[index],order[index-1]];return updatePrefs({dashboard_order:order});}):null,
      index<order.length-1?action('↓',()=>{[order[index+1],order[index]]=[order[index],order[index+1]];return updatePrefs({dashboard_order:order});}):null));
    return cards[key];
  }));
  return [el('section',{class:'welcome'},heading('p','DUO / CONTROL CENTER','eyebrow'),heading('h2','Salam, '+(ctx.me?.username??'üzv')+'.'),
    heading('p','Bu günün planını qur və irəliləyişinizi birlikdə izləyin.','lede'),
    el('div',{class:'actions'},el('time',{'data-clock':''},clock()),heading('span',partner?partner.username+' · '+status:'Dəvət gözlənilir','pill'))),grid];
}
async function settings(){
  const owner=workspace.created_by===ctx.user;
  return el('div',{class:'grid'},panel('Profil',form([field('username','İstifadəçi adı','text',ctx.me?.username??'',{required:true,maxlength:60})],async ({username})=>{
    await result(db.from('profiles').update({username:username.trim()}).eq('id',ctx.user).select('id').single());
    await refreshPeople();shell();await render();
  })),panel('Görünüş',form([field('accent','Vurğu rəngi','color',ctx.prefs?.accent??'#9b7bff')],updatePrefs)),
  owner && ctx.admin ? panel('Admin paneli',
    heading('p','İkinci üzv üçün istifadəçi adı və şifrə yaradın.','muted'),
    form([
      field('username','İstifadəçi adı','text','',{required:true,minlength:3,maxlength:32,pattern:'[A-Za-z0-9_]{3,32}'}),
      field('password','Yeni şifrə','password','',{required:true,minlength:12,maxlength:72,autocomplete:'new-password'})
    ],async (values)=>{
      const {session}=await result(db.auth.getSession());
      if (!session) throw Error('Yenidən daxil olun.');
      const account=await authRequest('/api/admin-users',{...values,workspaceId:ctx.workspace},session.access_token);
      await refreshPeople();
      await render();
      toast(account.username+' workspace-ə əlavə edildi.');
    },'İstifadəçi yarat')):null);
}
async function arena(){
  const rows=await ctx.rows('user_xp_events');
  const today=day(),monday=new Date(today+'T12:00Z');
  monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
  const week=monday.toISOString().slice(0,10);
  const board=ctx.people.map(person=>{
    const events=rows.filter(r=>r.owner_id===person.id);
    return {person,total:events.reduce((n,r)=>n+r.xp,0),weekly:events.filter(r=>day(new Date(r.created_at))>=week).reduce((n,r)=>n+r.xp,0)};
  }).sort((a,b)=>b.weekly-a.weekly);
  return panel('Həftəlik liderlər',heading('p','İlk dəfə tamamlanan hər tapşırıq 10 XP qazandırır.','muted'),
    board.map((r,i)=>el('article',{class:'row'},heading('strong',(i+1)+' · '+r.person.username),
      heading('span',r.weekly+' XP · Səviyyə '+(1+Math.floor(r.total/100))))));
}
async function notifications(){
  const rows=await result(db.from('notifications').select('*').eq('workspace_id',ctx.workspace).order('created_at',{ascending:false}).limit(100));
  const labels={messages:'Yeni mesaj',tasks:'Yeni tapşırıq',files:'Yeni fayl',expenses:'Ortaq xərc',settlements:'Borc ödənişi',calendar_events:'Yeni ortaq hadisə'};
  return panel('Gələn bildirişlər',rows.length?rows.map(r=>el('article',{class:'row'},
    el('div',{},heading('strong',labels[r.kind]??r.kind),heading('small',new Date(r.created_at).toLocaleString('az-AZ'))),
    r.read_at?heading('small','Oxunub'):action('Oxundu',async()=>{
      await result(db.from('notifications').update({read_at:new Date().toISOString()}).eq('id',r.id).select('id').single());
      await render();
    }))):empty('Yeni bildiriş yoxdur.'));
}
const pageRender={dashboard,settings,arena,notifications,...modules,
  'pc-monitor':()=>panel('Agent not connected',heading('p','Windows agenti · Coming Soon','muted'),el('dl',{class:'telemetry'},['CPU','RAM','GPU','Temperatur','Şəbəkə','Uptime','Son heartbeat'].map(label=>[el('dt',{},label),el('dd',{},'—')]))),
  ai:()=>panel('Duo AI · Coming Soon',heading('p','Maliyyə analizi, tapşırıq planlaşdırılması, qeyd xülasəsi və təbii dildə axtarış.','muted'))
};
async function render(){
  if(!outlet?.isConnected || !ctx) return;
  const id=++renderId,key=route();
  const [label,glyph,description]=routes[key];
  const changed=lastRoute!==key;
  if(changed){
    lastRoute=key;
    document.querySelectorAll('nav a').forEach(a=>a.dataset.route===key?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'));
  }
  const header=el('header',{class:'page-header'},heading('p',description,'eyebrow'),el('h1',{},icon(glyph),key==='dashboard'?'Dashboard':label));
  if(changed){
    outlet.querySelectorAll('canvas').forEach(node=>Chart.getChart(node)?.destroy());
    outlet.replaceChildren(header,el('div',{class:'skeleton',role:'status','aria-label':'Yüklənir'}));
  }
  outlet.setAttribute('aria-busy','true');
  try{
    const body=await pageRender[key](ctx);
    if(id!==renderId||!outlet?.isConnected) return;
    outlet.querySelectorAll('canvas').forEach(node=>Chart.getChart(node)?.destroy());
    outlet.replaceChildren(header,...[body].flat());
    if(changed&&!matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.from(outlet.children,{opacity:0,y:9,duration:.27,stagger:.04,clearProps:'opacity,transform'});
  }catch(error){
    if(id===renderId) outlet.replaceChildren(header,panel('Məlumat yüklənmədi',empty(error.message),action('Yenidən yoxla',render)));
  }finally{
    if(id===renderId) outlet?.setAttribute('aria-busy','false');
  }
}
async function refreshPeople(){
  const members=await result(db.from('workspace_members').select('user_id').eq('workspace_id',ctx.workspace));
  const profiles=await result(db.from('profiles').select('*').in('id',members.map(m=>m.user_id)));
  ctx.people=members.map(m=>profiles.find(p=>p.id===m.user_id)??{id:m.user_id,username:'Üzv'});
  ctx.me=profiles.find(p=>p.id===ctx.user);
}
function queueRefresh(){
  clearTimeout(schedule);
  schedule=setTimeout(async()=>{
    if(!ctx) return;
    if(document.querySelector('dialog')||outlet?.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select')){
      dirty=true;return;
    }
    dirty=false;
    try{await refreshPeople();await render();}catch(error){toast(error.message);}
  },400);
}
document.addEventListener('focusout',()=>{if(dirty) queueRefresh();});
document.addEventListener('close',()=>{if(dirty) queueRefresh();},true);
window.addEventListener('hashchange',()=>{if(ctx) render();});
window.addEventListener('online',()=>{connected('Bağlantı bərpa olunur');queueRefresh();});
window.addEventListener('offline',()=>connected('Oflayn'));
let userId;
async function boot(user){
  const version=++bootId;
  clearInterval(ticker);clearInterval(heartbeat);clearTimeout(schedule);
  document.querySelector('dialog')?.close();
  outlet?.querySelectorAll('canvas').forEach(node=>Chart.getChart(node)?.destroy());
  if(subscription){const previous=subscription;subscription=null;await db.removeChannel(previous);}
  if(version!==bootId) return;
  ctx=null;outlet=null;lastRoute=null;userId=user?.id;
  if(!user){login();return;}
  try{
    const memberships=await result(db.from('workspaces').select('id,name,created_by').limit(1));
    if(version!==bootId) return;
    workspace=memberships[0];
    if(!workspace){join(user);return;}
    ctx={...scope(workspace.id,user.id),admin:user.app_metadata?.duo_admin===true,refresh:render,moreMessages:()=>{ctx.messageLimit=(ctx.messageLimit??30)+30;return render();}};
    const current=ctx;
    await refreshPeople();
    if(version!==bootId) return;
    if(!current.me){
      await result(db.from('profiles').insert({id:user.id,username:(user.email?.split('@')[0]||'Üzv').slice(0,60)}));
      await refreshPeople();
    }
    await preferences();
    if(version!==bootId) return;
    shell();await render();
    if(version!==bootId) return;
    ticker=setInterval(()=>{const node=outlet?.querySelector('[data-clock]');if(node) node.textContent=clock();},1000);
    const ping=()=>{if(document.visibilityState==='visible') result(db.from('profiles').update({last_seen:new Date().toISOString()}).eq('id',user.id)).catch(error=>toast(error.message));};
    ping();heartbeat=setInterval(ping,30000);
    subscription=db.channel('workspace:'+workspace.id);
    for(const table of ['messages','tasks','expenses','notes','calendar_events','files','vibes','projects','budgets','settlements','workspace_members','notifications','user_xp_events']){
      subscription.on('postgres_changes',{event:'*',schema:'public',table,filter:'workspace_id=eq.'+workspace.id},queueRefresh);
    }
    subscription.on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles'},queueRefresh)
      .subscribe(status=>{
        if(version!==bootId) return;
        connected(status==='SUBSCRIBED'?'Canlı bağlantı':'Bağlantı · '+status);
        if(status==='SUBSCRIBED') queueRefresh();
      });
  }catch(error){
    if(version===bootId) show(el('main',{class:'onboarding'},brand(),panel('Bağlantı xətası',empty(error.message),action('Yenidən yoxla',()=>boot(user)),action('Çıxış',()=>result(db.auth.signOut())))));
  }
}
if(db){
  db.auth.onAuthStateChange((event,session)=>{
    if(event==='INITIAL_SESSION'||event==='SIGNED_OUT'||session?.user.id!==userId){
      setTimeout(()=>boot(session?.user),0);
    }
  });
}else login();
document.addEventListener('pointermove',event=>{
  if(event.pointerType!=='mouse'||matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.style.setProperty('--mx',event.clientX+'px');
  document.documentElement.style.setProperty('--my',event.clientY+'px');
},{passive:true});