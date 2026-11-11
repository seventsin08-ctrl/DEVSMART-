// Generates a throw-away JWT secret and matching anon / service_role keys for the LOCAL stack only.
import crypto from 'node:crypto';
const secret = crypto.randomBytes(32).toString('hex');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (role) => {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ role, iss: 'supabase-local', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 10 * 365 * 86400 });
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
};
console.log(`JWT_SECRET=${secret}\nANON_KEY=${sign('anon')}\nSERVICE_ROLE_KEY=${sign('service_role')}`);
