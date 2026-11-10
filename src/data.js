import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
let remember = false;
export const rememberSession = value => { remember = value; };
const storage = {
  getItem(key) {
    const persistent = localStorage.getItem(key);
    if (persistent !== null) remember = true;
    return persistent ?? sessionStorage.getItem(key);
  },
  setItem(key,value) {
    const selected = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    other.removeItem(key);
    selected.setItem(key,value);
  },
  removeItem(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
};
export const db = url && key ? createClient(url,key,{auth:{storage}}) : null;

export async function authRequest(path, values, token) {
  const headers = {'Content-Type':'application/json'};
  if (token) headers.Authorization = 'Bearer '+token;
  const response = await fetch(path,{method:'POST',headers,body:JSON.stringify(values)});
  const payload = await response.json().catch(()=>null);
  if (!response.ok || !payload) throw Error(payload?.error ?? 'Giriş xidməti əlçatan deyil.');
  return payload;
}
export async function result(request) {
  const {data,error} = await request;
  if (error) throw Error(error.message);
  return data;
}
export function scope(workspace,user) {
  const rows = async (table, filter = query => query) => {
    const data = [];
    for (let offset = 0;; offset += 500) {
      const page = await result(filter(db.from(table).select('*').eq('workspace_id',workspace))
        .order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499));
      data.push(...page);
      if (page.length < 500) return data;
    }
  };
  const write = (table,values,id) => result(id
    ? db.from(table).update(values).eq('workspace_id',workspace).eq('id',id).select('id').single()
    : db.from(table).insert({...values,workspace_id:workspace}).select('id').single());
  const remove = (table,id) => result(db.from(table).delete().eq('workspace_id',workspace).eq('id',id).select('id').single());
  return {workspace,user,rows,write,remove};
}