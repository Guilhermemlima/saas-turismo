// Runs supabase/tests/database/*.sql against the LINKED Supabase project without Docker.
// Each file runs in one transaction that always aborts at the end (a deliberate exception
// carries the pgTAP results back), so no test data is ever committed to the real database.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const testDir = path.join(process.cwd(), "supabase", "tests", "database");
const workDir = mkdtempSync(path.join(tmpdir(), "db-test-remote-"));
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function instrument(sql) {
  return sql
    .replace(/select plan\((\d+)\);/, (_m, n) =>
      [
        `select plan(${n});`,
        "create temp table tap_out (n serial, line text);",
        "grant all on tap_out to public;",
        "grant usage on sequence tap_out_n_seq to public;",
      ].join("\n"),
    )
    .replace(/^select (is|throws_ok|lives_ok)\(/gm, (_m, fn) => `insert into tap_out (line) select ${fn}(`)
    .replace(/select \* from finish\(\);\s*rollback;\s*$/, () =>
      [
        "reset role;",
        "do $$ declare r text; begin",
        "  select string_agg(line, ' || ' order by n) into r from tap_out;",
        "  raise exception 'TAP_RESULTS %', r;",
        "end $$;",
      ].join("\n"),
    );
}

function run(file) {
  const target = path.join(workDir, file);
  writeFileSync(target, instrument(readFileSync(path.join(testDir, file), "utf8")));
  let output = "";
  try {
    output = execFileSync(npx, ["supabase", "db", "query", "--linked", "-f", target], { encoding: "utf8", stdio: "pipe", shell: process.platform === "win32" });
  } catch (error) {
    output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  const match = output.match(/TAP_RESULTS (.*?)(\\n|")/);
  if (!match) throw new Error(`${file}: no TAP results returned.\n${output.slice(-800)}`);
  return match[1].split(" || ");
}

let failed = 0;
let total = 0;
try {
  for (const file of readdirSync(testDir).filter((f) => f.endsWith(".sql")).sort()) {
    console.log(`\n# ${file}`);
    for (const line of run(file)) {
      total++;
      if (line.startsWith("not ok")) failed++;
      console.log(line);
    }
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

console.log(`\n${total - failed}/${total} passed (linked project, rolled back)`);
process.exit(failed ? 1 : 0);
