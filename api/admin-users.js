import { accountEmail, authClient, post } from '../lib/server-auth.js';

export default post(async (req, res) => {
  const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token) return res.status(401).json({error:'Daxil olun.'});
  const client = authClient();
  const {data:{user},error} = await client.auth.getUser(token);
  if (error || user?.app_metadata?.duo_admin !== true) return res.status(403).json({error:'Admin icazəsi tələb olunur.'});
  const {username,password,workspaceId} = req.body ?? {};
  const email = accountEmail(username);
  if (!email || typeof password !== 'string' || password.length < 12 || password.length > 72 ||
      typeof workspaceId !== 'string' || !/^[\da-f-]{36}$/i.test(workspaceId)) {
    return res.status(400).json({error:'İstifadəçi adı 3–32 simvol, şifrə 12–72 simvol olmalıdır.'});
  }

  const admin = authClient(true);
  const {data:workspace} = await admin.from('workspaces').select('id').eq('id',workspaceId).eq('created_by',user.id).maybeSingle();
  if (!workspace) return res.status(403).json({error:'Workspace sahibi tələb olunur.'});
  const {count,error:countError} = await admin.from('workspace_members').select('*',{count:'exact',head:true}).eq('workspace_id',workspaceId);
  if (countError) throw countError;
  if (count>=2) return res.status(409).json({error:'Workspace iki üzvlə məhdudlaşır.'});
  const {data,error:createError} = await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:username.trim()}});
  if (createError || !data.user) return res.status(409).json({error:'Hesab yaradıla bilmədi. İstifadəçi adını və şifrəni yoxlayın.'});
  const {error:joinError} = await admin.rpc('admin_add_member',{workspace:workspaceId,member:data.user.id,actor:user.id,label:username.trim()});
  if (joinError) {
    const {error:cleanupError} = await admin.auth.admin.deleteUser(data.user.id);
    if (cleanupError) throw cleanupError;
    return res.status(409).json({error:'İstifadəçi workspace-ə əlavə edilmədi.'});
  }
  return res.status(201).json({username:username.trim()});
});