import {build} from 'esbuild-wasm';
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';

const env={};
for(const file of ['.env','.env.local']){
  try {Object.assign(env,parseEnv(await readFile(file,'utf8')));}
  catch(error){if(error.code!=='ENOENT') throw error;}
}
const define={};
const aliases={
  VITE_SUPABASE_URL:'DUO_SUPABASE_URL',
  VITE_SUPABASE_PUBLISHABLE_KEY:'DUO_SUPABASE_PUBLISHABLE_KEY'
};
for(const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY']){
  define['import.meta.env.'+key]=JSON.stringify(process.env[key]??process.env[aliases[key]]??env[key]??'');
}
if(process.env.VERCEL_ENV==='production' && process.env.DUO_BOOTSTRAP_PASSWORD){
  await import('./provision.mjs');
}
await mkdir('dist/assets',{recursive:true});
await build({entryPoints:['src/main.js'],outfile:'dist/assets/main.js',bundle:true,format:'esm',minify:true,target:'es2022',define});
await copyFile('node_modules/lucide-static/sprite.svg','dist/assets/icons.svg');
const html=await readFile('index.html','utf8');
await writeFile('dist/index.html',html.replace('</head>','<link rel="stylesheet" href="/assets/main.css"></head>').replace('/src/main.js','/assets/main.js'));
