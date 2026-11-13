import { afterEach, describe, expect, it } from 'vitest';
import { hashIp } from '../../netlify/functions/_lib/http';

const saved = { salt: process.env.IP_HASH_SALT, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
afterEach(() => {
  for (const [name, value] of [['IP_HASH_SALT', saved.salt], ['SUPABASE_SERVICE_ROLE_KEY', saved.key]] as const) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

describe('visitor IP hashing', () => {
  it('never stores the raw address and is stable per address', () => {
    process.env.IP_HASH_SALT = 'salt-one';
    const a = hashIp('203.0.113.7');
    expect(a).toMatch(/^[0-9a-f]{40}$/);
    expect(a).not.toContain('203');
    expect(hashIp('203.0.113.7')).toBe(a);
    expect(hashIp('203.0.113.8')).not.toBe(a);
  });

  it('uses the secret service key when no salt is set, treating an empty salt as unset', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-A';
    process.env.IP_HASH_SALT = '';
    const withKeyA = hashIp('198.51.100.9');
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-B';
    expect(hashIp('198.51.100.9')).not.toBe(withKeyA); // keyed by the secret, not by a public default
    delete process.env.IP_HASH_SALT;
    expect(hashIp('198.51.100.9')).not.toBe(withKeyA);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(hashIp('198.51.100.9')).toMatch(/^[0-9a-f]{40}$/); // still works with no configuration at all
  });
});
