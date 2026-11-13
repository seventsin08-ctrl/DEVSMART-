// Combines supabase/migrations/*.sql (in order) into ONE file, supabase/setup.sql, so the whole
// database can be created with a single paste into Supabase → SQL Editor.
//   node scripts/build-setup-sql.mjs          (npm run build:sql)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'supabase/migrations');

export function buildSetupSql() {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const header = `-- ============================================================================
-- DevMart: complete database setup (generated file, do not edit)
-- Contains: ${files.join(', ')}
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run, ONCE, on an empty project.
-- Supabase may show a yellow "destructive operations" warning (the script contains the word
-- "delete" in table rules). That is expected: choose "Run this query".
-- Regenerate with: npm run build:sql
-- ============================================================================

`;
  return header + files.map((f) => `-- ---------------------------------------------------------------------------\n-- ${f}\n-- ---------------------------------------------------------------------------\n${readFileSync(path.join(dir, f), 'utf8').trimEnd()}\n`).join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const out = path.join(root, 'supabase/setup.sql');
  writeFileSync(out, buildSetupSql());
  console.log(`wrote ${path.relative(root, out)}`);
}
