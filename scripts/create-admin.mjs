import { accountEmail, authClient } from '../lib/server-auth.js';

const username = process.argv[2];
const email = accountEmail(username);
const password = process.env.DUO_BOOTSTRAP_PASSWORD;
if (!email || !password) throw Error('Provide the username argument and DUO_BOOTSTRAP_PASSWORD.');
const { error } = await authClient(true).auth.admin.createUser({
  email,password,email_confirm:true,
  app_metadata:{duo_admin:true},
  user_metadata:{username:username.trim()}
});
if (error) throw error;
console.log('Admin account created.');
