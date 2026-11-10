import {Chart,BarController,BarElement,CategoryScale,LinearScale,Tooltip} from 'chart.js';
import DOMPurify from 'dompurify';
import {marked} from 'marked';
import {db,result} from './data.js';
import {action,el,empty,field,form,heading,modal,panel} from './ui.js';
import {balance,csvCell,day,minor,money,safeLink,sum} from './core.js';
Chart.register(BarController,BarElement,CategoryScale,LinearScale,Tooltip);
export const statuses = [['todo','Gözləyir'],['doing','İcrada'],['review','Yoxlamada'],['done','Tamamlandı']];
const title = row => field('title','Başlıq','text',row.title,{required:true,maxlength:180});
const body = row => field('body','Təsvir','textarea',row.body);
const date = (key,label,value) => field(key,label,'date',value);
const amount = row => field('amount_minor','Məbləğ (AZN)','number',row.amount_minor == null?'':(row.amount_minor/100).toFixed(2),{step:'0.01',min:'0.01',required:true});
const privacy = row => field('private','Şəxsi','checkbox',row.private);
const schemas = {
  expenses:r=>[title(r),amount(r),field('category','Kateqoriya','text',r.category,{required:true}),date('day','Tarix',r.day??day()),field('shared','Ortaq xərc','checkbox',r.shared)],
  budgets:r=>[title(r),amount(r),field('month','Ay','month',r.month?.slice(0,7)??day().slice(0,7),{required:true})],
  settlements:r=>[amount(r),date('day','Ödəniş tarixi',r.day??day())],
  messages:r=>[field('body','Mesaj','textarea',r.body,{required:true,maxlength:8000}),field('pinned','Bərkidilmiş','checkbox',r.pinned)],
  folders:r=>[title(r),privacy(r)],
  projects:r=>[title(r),body(r)],
  tasks:(r,c)=>[title(r),body(r),date('due','Son tarix',r.due),field('priority','Prioritet',[['low','Aşağı'],['normal','Normal'],['high','Yüksək']],r.priority??'normal'),field('status','Status',statuses,r.status),field('project_id','Layihə',[['','Seçilməyib'],...(c.projects??[]).map(p=>[p.id,p.title])],r.project_id),field('assignee','Məsul şəxs',[['','Seçilməyib'],...c.people.map(p=>[p.id,p.username])],r.assignee)],
  notes:r=>[title(r),field('body','Markdown','textarea',r.body),field('tags','Etiketlər','text',r.tags),field('pinned','Bərkidilmiş','checkbox',r.pinned),privacy(r)],
  calendar_events:r=>[title(r),body(r),date('day','Tarix',r.day??day()),privacy(r)],
  vibes:r=>[title(r),field('kind','Növ',[['movie','Film'],['game','Oyun'],['music','Musiqi']],r.kind),field('url','Link','url',r.url),field('favorite','Sevimli','checkbox',r.favorite)],
};
export function edit(ctx,table,row={},label='Yeni qeyd') {
  const fields = schemas[table](row,ctx);
  const dialog = modal(row.id?'Redaktə et':label,form(fields,async values=>{
    for (const f of fields) if (f.type==='checkbox') values[f.name] = Boolean(values[f.name]);
    if ('amount_minor' in values) values.amount_minor=minor(values.amount_minor);
    if ('month' in values) values.month+='-01';
    if ('url' in values && values.url && !safeLink(values.url)) throw Error('HTTP və ya HTTPS linki daxil edin.');
    for(const key of ['due','project_id','assignee']) if(values[key]==='') values[key]=null;
    if ('day' in values && !values.day) throw Error('Tarixi daxil edin.');
    await ctx.write(table,values,row.id);
    dialog.close();
    await ctx.refresh();
  }));
}
function controls(ctx,table,row) {
  if (row.owner_id!==ctx.user) return null;
  return el('div',{class:'actions'},action('Redaktə',()=>edit(ctx,table,row)),action('Sil',async()=>{
    const dialog = modal('Qeydi silmək istəyirsiniz?',action('Təsdiqlə',async()=>{await ctx.remove(table,row.id);dialog.close();await ctx.refresh();},'danger'));
  }));
}
const rowList = (rows, render) => rows.length ? rows.map(render) : empty();
const line = (name,detail,...actions) => el('article',{class:'row'},el('div',{},heading('strong',name),detail),actions);
const small = text => heading('small',text);
export function chart(rows) {
  const canvas = el('canvas',{'aria-label':'Günlər üzrə xərclər',role:'img'});
  const days = [...new Set(rows.map(r=>r.day))].sort().slice(-12);
  requestAnimationFrame(()=> {
    if (!canvas.isConnected || !days.length) return;
    new Chart(canvas,{type:'bar',data:{labels:days.map(d=>d.slice(5)),datasets:[{data:days.map(d=>Number(sum(rows.filter(r=>r.day===d)))/100),backgroundColor:'#9074ff',borderRadius:5}]},options:{animation:!matchMedia('(prefers-reduced-motion: reduce)').matches,scales:{x:{ticks:{color:'#9da7c4'},grid:{display:false}},y:{ticks:{color:'#9da7c4'},grid:{color:'#252941'},beginAtZero:true}}}});
  });
  return days.length ? canvas : empty('Qrafik üçün xərc əlavə edin.');
}
export async function wallet(ctx) {
  const [expenses,settlements,budgets] = await Promise.all(['expenses','settlements','budgets'].map(t=>ctx.rows(t)));
  const month=el('input',{type:'month',value:day().slice(0,7),'aria-label':'Xərc ayı'});
  const content=el('div',{class:'grid'});
  function draw(){
    content.querySelectorAll('canvas').forEach(node=>Chart.getChart(node)?.destroy());
    const visible=expenses.filter(r=>!month.value||r.day.startsWith(month.value));
    const debt=balance(expenses,settlements,ctx.user);
    content.replaceChildren(panel('Aylıq xərclər',heading('div',money(sum(visible)),'metric'),chart(visible)),
      panel('Ortaq balans',heading('div',money(debt),'metric'),small(debt>0?'Sizə qaytarılacaq':debt<0?'Sizin borcunuz':'Balans bərabərdir'),action('Ödəniş qeyd et',()=>edit(ctx,'settlements')),rowList(settlements,r=>line(money(r.amount_minor),small(r.day),controls(ctx,'settlements',r)))),
      panel('Xərclər',rowList(visible,r=>line(r.title,small(r.day+' · '+r.category+' · '+money(r.amount_minor)+(r.shared?' · Ortaq':'')),controls(ctx,'expenses',r)))),
      panel('Büdcələr',action('Limit əlavə et',()=>edit(ctx,'budgets')),rowList(budgets,r=>{
        const spent=sum(expenses.filter(e=>e.day.startsWith(r.month.slice(0,7))));
        return line(r.title,small(r.month.slice(0,7)+' · '+money(spent)+' / '+money(r.amount_minor)+(spent>BigInt(r.amount_minor)?' · Limit aşılıb':'')),controls(ctx,'budgets',r));
      })));
  }
  month.addEventListener('change',draw);
  draw();
  return [el('div',{class:'actions'},action('Xərc əlavə et',()=>edit(ctx,'expenses'), 'primary'),month,action('CSV export',()=>{
    const records=expenses.filter(r=>!month.value||r.day.startsWith(month.value));
    const csv=['Başlıq,Kateqoriya,Tarix,AZN,Ortaq',...records.map(r=>[r.title,r.category,r.day,(r.amount_minor/100).toFixed(2),r.shared].map(csvCell).join(','))].join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv'}));
    el('a',{href:url,download:'duo-expenses.csv'}).click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  })),content];
}
export async function chat(ctx){
  const limit=ctx.messageLimit??30;
  const query=db.from('messages').select('*').eq('workspace_id',ctx.workspace).order('created_at',{ascending:false}).order('id',{ascending:false});
  const messages=await result(query.limit(limit));
  const list=el('div',{class:'chat-list'});
  const render=r=>el('article',{class:'message'+(r.owner_id===ctx.user?' mine':'')},small((r.pinned?'◆ ':'')+(ctx.people.find(p=>p.id===r.owner_id)?.username??'Üzv')+' · '+new Date(r.created_at).toLocaleString('az-AZ')),heading('p',r.body),controls(ctx,'messages',r));
  list.append(rowList([...messages].reverse(),render));
  return panel('Workspace söhbəti',messages.length===limit?action('Əvvəlki mesajlar',()=>ctx.moreMessages()):null,
    form([field('query','Mesajlarda axtar','search','',{required:true,maxlength:100})],async ({query})=>{
      const rows=await ctx.rows('messages',q=>q.ilike('body','%'+query.replace(/[\\%_]/g,'\\$&')+'%').limit(50));
      modal('Axtarış nəticələri',rowList(rows,render));
    },'Axtar'),list,
    form([field('body','Mesaj','textarea','',{required:true,maxlength:8000})],async ({body})=>{await ctx.write('messages',{body:body.trim()});await ctx.refresh();},'Göndər'));
}
export async function drive(ctx) {
  const files=await ctx.rows('files');
  const bucket=db.storage.from('duo-private');
  async function upload(items, privateFile) {
    for (const file of items) {
      if (!file.name || file.size>26214400 || file.name.length>180) throw Error('Fayl limiti 25 MiB, ad limiti 180 simvoldur.');
      const path=[ctx.workspace,ctx.user,privateFile?'private':'shared',crypto.randomUUID()].join('/');
      await result(bucket.upload(path,file,{contentType:'application/octet-stream'}));
      try {await ctx.write('files',{path,title:file.name,size:file.size,private:privateFile});}
      catch(error){await result(bucket.remove([path]));throw error;}
    }
    await ctx.refresh();
  }
  const uploadForm=form([field('files','Fayllar','file','',{multiple:true,required:true}),privacy({})],({private:visibility})=>upload(uploadForm.elements.files.files,Boolean(visibility)),'Yüklə');
  uploadForm.addEventListener('dragover',event=>event.preventDefault());
  uploadForm.addEventListener('drop',async event=>{
    event.preventDefault();
    try {await upload(event.dataTransfer.files,uploadForm.elements.private.checked);}
    catch(error){(await import('./ui.js')).toast(error.message);}
  });
  const list=el('div');
  const draw=q=>list.replaceChildren(...[].concat(rowList(files.filter(f=>f.title.toLowerCase().includes(q)),r=>line(r.title,small((r.private?'Şəxsi':'Ortaq')+' · '+Math.ceil(r.size/1024)+' KiB'),el('div',{class:'actions'},
    action('Endir',async()=>{const data=await result(bucket.createSignedUrl(r.path,60,{download:r.title}));el('a',{href:data.signedUrl,rel:'noreferrer'}).click();}),
    r.owner_id===ctx.user?[action('Adı dəyiş',()=>{const dialog=modal('Faylın adı',form([title(r)],async values=>{await ctx.write('files',values,r.id);dialog.close();await ctx.refresh();}));}),
      action('Sil',()=>{const dialog=modal('Faylı silmək istəyirsiniz?',action('Təsdiqlə',async()=>{await result(bucket.remove([r.path]));await ctx.remove('files',r.id);dialog.close();await ctx.refresh();},'danger'));})]:null)))));
  draw('');
  return [panel('Fayl yüklə',small('Sürükləyib bu sahəyə buraxın. Hər fayl üçün 25 MiB.'),uploadForm),
    panel('Fayllar · '+Math.ceil(files.reduce((n,f)=>n+f.size,0)/1024)+' KiB',el('input',{type:'search',placeholder:'Fayl axtar','aria-label':'Fayl axtar',oninput:e=>draw(e.target.value.toLowerCase())}),list)];
}
export async function tasks(ctx) {
  const [rows,projects]=await Promise.all([ctx.rows('tasks'),ctx.rows('projects')]);
  const context={...ctx,projects};
  const move=async (r,status)=>{await ctx.write('tasks',{status},r.id);await ctx.refresh();};
  return [action('Tapşırıq yarat',()=>edit(context,'tasks'), 'primary'),
    el('div',{class:'kanban'},statuses.map(([status,label])=>el('section',{class:'panel',ondragover:e=>e.preventDefault(),ondrop:async e=>{
      e.preventDefault();
      const r=rows.find(r=>r.id===e.dataTransfer.getData('text/plain'));
      if(r && (r.owner_id===ctx.user||r.assignee===ctx.user)) try{await move(r,status);}catch(error){(await import('./ui.js')).toast(error.message);}
    }},heading('h2',label),rowList(rows.filter(r=>r.status===status),r=>{
      const canMove=r.owner_id===ctx.user||r.assignee===ctx.user;
      return el('article',{class:'task',draggable:String(canMove),ondragstart:e=>e.dataTransfer.setData('text/plain',r.id)},heading('strong',r.title),small(r.priority+' · '+(r.due??'Tarixsiz')),heading('p',r.body),
        canMove?form([field('status','Status',statuses,r.status)],values=>move(r,values.status),'Köçür'):null,controls(context,'tasks',r));
    }))))];
}
export async function projects(ctx) {
  const [rows,ts]=await Promise.all([ctx.rows('projects'),ctx.rows('tasks')]);
  return panel('Ortaq layihələr',action('Layihə yarat',()=>edit(ctx,'projects'), 'primary'),rowList(rows,r=>{
    const related=ts.filter(t=>t.project_id===r.id);
    return line(r.title,small(r.body+' · '+related.filter(t=>t.status==='done').length+'/'+related.length+' tapşırıq'),controls(ctx,'projects',r));
  }));
}
export async function notes(ctx) {
  const rows=(await ctx.rows('notes')).sort((a,b)=>Number(b.pinned)-Number(a.pinned));
  const list=el('div',{class:'grid'});
  const draw=q=>list.replaceChildren(...[].concat(rowList(rows.filter(r=>[r.title,r.body,r.tags].some(s=>s.toLowerCase().includes(q))),r=>{
    const markdown=el('div',{class:'markdown'});
    markdown.innerHTML=DOMPurify.sanitize(marked.parse(r.body),{FORBID_TAGS:['img','iframe','form','input','button','style'],FORBID_ATTR:['style']});
    return panel((r.pinned?'◆ ':'')+r.title,small((r.private?'Şəxsi':'Ortaq')+' · '+r.tags),markdown,controls(ctx,'notes',r));
  })));
  draw('');
  return [el('div',{class:'actions'},action('Qeyd yarat',()=>edit(ctx,'notes'), 'primary'),el('input',{type:'search',placeholder:'Qeyd axtar','aria-label':'Qeyd axtar',oninput:e=>draw(e.target.value.toLowerCase())})),list];
}
export async function calendar(ctx) {
  const [events,tasks]=await Promise.all([ctx.rows('calendar_events'),ctx.rows('tasks')]);
  const input=el('input',{type:'date',value:day(),'aria-label':'Təqvim tarixi'});
  const view=el('select',{'aria-label':'Təqvim görünüşü'},['Ay','Həftə','Gün'].map((label,i)=>el('option',{value:i},label)));
  const grid=el('div',{class:'calendar'});
  const draw=()=>{
    const ref=new Date((input.value||day())+'T12:00:00Z');
    const mode=Number(view.value);
    const count=mode===0?new Date(Date.UTC(ref.getUTCFullYear(),ref.getUTCMonth()+1,0)).getUTCDate():mode===1?7:1;
    if(mode===0) ref.setUTCDate(1);
    if(mode===1) ref.setUTCDate(ref.getUTCDate()-(ref.getUTCDay()+6)%7);
    grid.replaceChildren(...Array.from({length:count},(_,i)=>{
      const date=new Date(ref);date.setUTCDate(date.getUTCDate()+i);
      const key=date.toISOString().slice(0,10);
      const items=events.filter(e=>e.day===key);
      return el('section',{class:'calendar-day'},heading('strong',key.slice(5)),items.map(r=>el('div',{class:'calendar-event'},heading('span',r.title),controls(ctx,'calendar_events',r))),tasks.filter(t=>t.due===key).map(t=>small('▸ '+t.title)));
    }));
  };
  input.addEventListener('change',draw);view.addEventListener('change',draw);draw();
  return [el('div',{class:'actions'},action('Hadisə yarat',()=>edit(ctx,'calendar_events',{day:input.value}), 'primary'),input,view),grid];
}
export async function vibes(ctx) {
  const rows=await ctx.rows('vibes');
  const selected=heading('strong','');
  return panel('Birlikdə bax, oyna, dinlə',el('div',{class:'actions'},action('Tövsiyə əlavə et',()=>edit(ctx,'vibes'), 'primary'),
    rows.length?action('Təsadüfi seçim',()=>selected.textContent=rows[crypto.getRandomValues(new Uint32Array(1))[0]%rows.length].title):null,selected),
    rowList(rows,r=>line((r.favorite?'★ ':'')+r.title,small({movie:'Film',game:'Oyun',music:'Musiqi'}[r.kind]),
      safeLink(r.url)?el('a',{href:safeLink(r.url),target:'_blank',rel:'noopener noreferrer'},'Aç'):null,controls(ctx,'vibes',r))));
}
