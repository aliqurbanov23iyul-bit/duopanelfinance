import { accountEmail, authClient, post, sameCode } from '../lib/server-auth.js';

export default post(async (req, res) => {
  const { username, password, code } = req.body ?? {};
  const email = accountEmail(username);
  if (!process.env.DUO_ACCESS_CODE) return res.status(503).json({error:'Giriş kodu konfiqurasiya edilməyib.'});
  if (!email || typeof password !== 'string' || password.length > 128 || !sameCode(code)) {
    return res.status(401).json({error:'Giriş məlumatları yanlışdır.'});
  }
  const { data, error } = await authClient().auth.signInWithPassword({email,password});
  if (error || !data.session) return res.status(error?.status===429?429:401).json({error:'Giriş məlumatlarını yoxlayıb yenidən cəhd edin.'});
  const {access_token,refresh_token} = data.session;
  return res.status(200).json({access_token,refresh_token});
});