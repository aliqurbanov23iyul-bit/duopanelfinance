import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'node:crypto';

export function authClient(admin = false) {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.DUO_SUPABASE_URL;
  const key = admin
    ? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.DUO_SUPABASE_SERVICE_ROLE_KEY ?? process.env.DUO_SUPABASE_SECRET_KEY
    : process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.DUO_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Missing authentication configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function accountEmail(username) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,32}$/.test(username.trim())) return null;
  return username.trim().toLowerCase() + '@accounts.duospace.example';
}

export function sameCode(input) {
  const code = process.env.DUO_ACCESS_CODE;
  if (!code || typeof input !== 'string' || input.length > 256) return false;
  const digest = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(input), digest(code));
}

export function post(handler) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({error:'Yalnız POST qəbul edilir.'});
    }
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '') ||
        req.headers['sec-fetch-site'] === 'cross-site') return res.status(415).json({error:'Sorğu qəbul edilmədi.'});
    try { return await handler(req, res); }
    catch { return res.status(503).json({error:'Giriş xidməti əlçatan deyil.'}); }
  };
}
