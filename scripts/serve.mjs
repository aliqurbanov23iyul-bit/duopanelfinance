import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const assets=new Map([['/',['index.html','text/html; charset=utf-8']],['/assets/main.js',['assets/main.js','text/javascript']],['/assets/main.css',['assets/main.css','text/css']],['/assets/icons.svg',['assets/icons.svg','image/svg+xml']]]);
const server=createServer(async(req,res)=>{
  const item=assets.get(new URL(req.url,'http://localhost').pathname);
  if(!item){res.writeHead(404).end();return;}
  try{
    const body=await readFile(new URL('../dist/'+item[0],import.meta.url));
    res.writeHead(200,{'Content-Type':item[1]}).end(body);
  }catch{res.writeHead(500).end();}
});
server.listen(4173,'127.0.0.1',()=>console.log('http://127.0.0.1:4173'));
