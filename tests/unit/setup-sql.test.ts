import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs helper without type declarations
import { buildSetupSql } from '../../scripts/build-setup-sql.mjs';

describe('supabase/setup.sql', () => {
  it('is up to date with the migrations (run: npm run build:sql)', () => {
    const onDisk = readFileSync(path.resolve(__dirname, '../../supabase/setup.sql'), 'utf8');
    expect(onDisk).toBe(buildSetupSql());
  });
  it('creates every table, the storage buckets and the owner-only rules', () => {
    const sql = readFileSync(path.resolve(__dirname, '../../supabase/setup.sql'), 'utf8');
    for (const table of ['orders', 'customers', 'payment_submissions', 'payment_transactions', 'website_pages', 'audit_logs', 'admin_roles']) {
      expect(sql).toContain(`create table public.${table}`);
    }
    for (const needle of ['payment-proofs', 'enable row level security', 'function public.is_admin', "'aal2'"]) expect(sql).toContain(needle);
  });
});
