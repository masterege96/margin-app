// Applies the migrations to an in-memory Postgres (PGlite) on top of a Supabase stub,
// then runs isolation_test.sql. Usage: node run.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');
const db = new PGlite();

await db.exec(readFileSync(join(here, 'stub_supabase.sql'), 'utf8'));
for (const file of readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  console.log(`applied ${file}`);
}

try {
  await db.exec(readFileSync(join(here, 'isolation_test.sql'), 'utf8'));
  console.error('Test block finished without raising; it should always raise.');
  process.exit(1);
} catch (err) {
  console.log(err.message);
  process.exit(err.message.startsWith('ALL CHECKS PASSED') ? 0 : 1);
}
