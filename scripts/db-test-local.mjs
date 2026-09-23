// Applies supabase/migrations to an in-process Postgres (PGlite) with a minimal Supabase
// emulation (auth schema, roles) and runs supabase/tests/database/*.sql through a tiny pgTAP
// shim. Lets RLS be verified without Docker. The real `supabase test db` remains the reference.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.argv[2] ?? process.cwd();
const migDir = path.join(ROOT, "supabase", "migrations");
const testDir = path.join(ROOT, "supabase", "tests", "database");

// Minimal emulation of the Supabase environment.
const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema extensions; create schema auth;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
`;

// Tiny pgTAP shim: results recorded by a security definer helper.
const TAP_SHIM = `
  create schema tap; create table tap.results (n serial, ok boolean, description text, detail text);
  grant usage on schema tap to anon, authenticated;
  create function tap.record(p_ok boolean, p_desc text, p_detail text default null) returns text
    language sql security definer as $$ insert into tap.results (ok, description, detail) values (p_ok, p_desc, p_detail); select case when p_ok then 'ok' else 'not ok' end || ' - ' || p_desc $$;
  grant execute on function tap.record(boolean, text, text) to anon, authenticated;
  create function public.plan(int) returns text language sql as $$ select '1..' || $1 $$;
  create function public.finish() returns setof text language sql as $$ select 'done'::text $$;
  create function public.is(anyelement, anyelement, text) returns text language sql as $$
    select tap.record($1 is not distinct from $2, $3, format('got %s, expected %s', $1, $2)) $$;
  create function public.throws_ok(p_sql text, p_code text, p_msg text, p_desc text) returns text language plpgsql as $$
  begin
    execute p_sql;
    return tap.record(false, p_desc, 'no exception raised');
  exception when others then
    return tap.record(sqlstate = p_code, p_desc, format('sqlstate %s: %s', sqlstate, sqlerrm));
  end $$;
  create function public.lives_ok(p_sql text, p_desc text) returns text language plpgsql as $$
  begin
    execute p_sql;
    return tap.record(true, p_desc);
  exception when others then
    return tap.record(false, p_desc, format('sqlstate %s: %s', sqlstate, sqlerrm));
  end $$;
  grant execute on all functions in schema public to anon, authenticated;
`;

async function freshDatabase() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(migDir).sort()) {
    try {
      await db.exec(readFileSync(path.join(migDir, file), "utf8"));
    } catch (e) {
      console.error("MIGRATION FAILED:", file, "\n", e.message);
      process.exit(1);
    }
  }
  await db.exec(TAP_SHIM);
  return db;
}

let total = 0;
let failed = 0;
const testFiles = readdirSync(testDir).filter((f) => f.endsWith(".sql")).sort();

// Each test file gets its own database so files never depend on each other's data.
for (const file of testFiles) {
  const db = await freshDatabase();
  const sql = readFileSync(path.join(testDir, file), "utf8")
    .replace(/create extension if not exists pgtap[^;]*;/i, "")
    // Keep the transaction so tap.results can be read afterwards; the database is discarded anyway.
    .replace(/\brollback;\s*$/i, "commit;");
  console.log(`
# ${file}`);
  try {
    await db.exec(sql);
  } catch (e) {
    failed++;
    console.error("TEST FILE ERROR:", e.message);
    await db.exec("rollback").catch(() => {});
  }
  await db.exec("reset role");
  const { rows } = await db.query("select n, ok, description, detail from tap.results order by n");
  for (const r of rows) {
    total++;
    if (!r.ok) failed++;
    console.log(`${r.ok ? "ok    " : "NOT OK"} ${r.n} - ${r.description}${r.ok ? "" : "  -> " + r.detail}`);
  }
  await db.close();
}

console.log(`\n${readdirSync(migDir).length} migrations · ${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
