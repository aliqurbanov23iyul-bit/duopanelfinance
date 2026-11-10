const sprite = '/assets/icons.svg';
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== null && value !== false) node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false));
  return node;
}
export function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const node = document.createElementNS(ns,'svg');
  node.setAttribute('class','icon');
  node.setAttribute('aria-hidden','true');
  const use = document.createElementNS(ns,'use');
  use.setAttribute('href',sprite + '#' + name);
  node.append(use);
  return node;
}
let timeout;
export function toast(message) {
  const target = document.querySelector('#toast');
  target.textContent = message;
  clearTimeout(timeout);
  timeout = setTimeout(() => target.textContent = '', 5500);
}
export const action = (label, handler, cls = 'secondary') => el('button',{type:'button',class:cls,onclick:async event => {
  const button = event.currentTarget;
  if (button.disabled) return;
  button.disabled = true;
  try { await handler(event); } catch(error) { toast(error.message); }
  finally { button.disabled = false; }
}},label);
export const field = (name,label,type='text',value='',extra={}) => ({name,label,type,value,extra});
export function form(fields, submit, label='Yadda saxla') {
  const button = el('button',{class:'primary',type:'submit'},label);
  const node = el('form',{onsubmit:async event => {
    event.preventDefault();
    if (button.disabled) return;
    const values = Object.fromEntries(new FormData(node));
    button.disabled = true;
    try { await submit(values); } catch(error) { toast(error.message); }
    finally { button.disabled = false; }
  }});
  for (const {name,label,type,value,extra} of fields) {
    const attrs = {name,...extra};
    let control;
    if (Array.isArray(type)) {
      control = el('select',attrs,type.map(item => {
        const [key,text] = Array.isArray(item) ? item : [item,item];
        return el('option',{value:key,selected:key===value},text);
      }));
    } else if (type==='textarea') control = el('textarea',attrs,value);
    else control = el('input',{...attrs,type,value:type==='file'?null:value,checked:type==='checkbox' && value});
    node.append(el('label',{class:type==='checkbox'?'check':''},label,control));
  }
  node.append(button);
  return node;
}
export function modal(title,content) {
  document.querySelector('dialog')?.close();
  const dialog = el('dialog',{},el('header',{class:'spread'},el('h2',{},title),action('Bağla',()=>dialog.close())),content);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
export const empty = (text='Hələ məlumat yoxdur.') => el('div',{class:'empty'},text);
export const panel = (title,...body) => el('section',{class:'panel'},el('h2',{},title),body);
export const heading = (tag,text,cls) => el(tag,{class:cls ?? ''},text);