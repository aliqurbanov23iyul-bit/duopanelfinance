import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import { accountEmail, authClient } from '../lib/server-auth.js';

const connectionString = new URL(process.env.DUO_POSTGRES_URL);
connectionString.searchParams.delete('pgbouncer');
connectionString.searchParams.delete('sslmode');
const certificate = await fetch('https://supabase.com/downloads/prod-ca-2021.crt',{signal:AbortSignal.timeout(10000)});
if(!certificate.ok) throw Error('Supabase database certificate unavailable');
const ca = await certificate.text();
const client = new pg.Client({connectionString:connectionString.href,ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:15000});
await client.connect();
try {
  await client.query('begin');
  await client.query('select pg_advisory_xact_lock(34961852)');
  await client.query('create schema if not exists duo_internal');
  await client.query('create table if not exists duo_internal.migrations (name text primary key)');
  const files = (await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort();
  for (const file of files) {
    const {rowCount} = await client.query('select 1 from duo_internal.migrations where name=$1',[file]);
    if (rowCount) continue;
    const sql = await readFile('supabase/migrations/'+file,'utf8');
    await client.query(sql.trim().replace(/^begin;\s*/i,'').replace(/\s*commit;$/i,''));
    await client.query('insert into duo_internal.migrations values ($1)',[file]);
  }
  await client.query('commit');
} catch (error) {
  await client.query('rollback');
  throw Error('DUO migration failed: '+(error.code??'unknown')+' '+error.message);
} finally {
  await client.end();
}

const admin = authClient(true);
const email = accountEmail('ok4nner');
const password = process.env.DUO_BOOTSTRAP_PASSWORD;
const {error} = await admin.auth.admin.createUser({
  email,password,email_confirm:true,app_metadata:{duo_admin:true},user_metadata:{username:'ok4nner'}
});
if(error && error.code!=='email_exists' && error.code!=='user_already_exists') {
  throw Error('DUO admin creation failed: '+error.code);
}
const browser = authClient();
const {data,error:loginError} = await browser.auth.signInWithPassword({email,password});
if(loginError || data.user?.app_metadata?.duo_admin!==true) throw Error('DUO admin sign-in verification failed');
const {error:readError} = await browser.from('workspaces').select('id').limit(1);
if(readError) throw Error('DUO workspace verification failed: '+readError.code);
console.log('DUO migrations and admin sign-in verified.');
