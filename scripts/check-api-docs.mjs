// Checks that docs/openapi.yaml matches the backend code in this repo.
// Run: npm run api:check   (no dependencies, no network)
//
// Fails when:
//  - a folder in supabase/functions/ (except _shared) has no path in the spec,
//    or the spec has a function path with no folder;
//  - a Vercel function in api/ is not the x-source of some operation;
//  - an x-source file does not exist;
//  - x-verify-jwt differs from supabase/config.toml (functions not listed
//    there use Supabase's default, true);
//  - the app calls functions.invoke("<name>") for a function the spec lacks;
//  - an operationId is used twice.
//
// It reads the spec line by line, so keep its layout: paths at two spaces
// ("  /name:"), and x-verify-jwt / x-source / operationId inside each path.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), "utf8");
const problems = [];

// ── Spec ───────────────────────────────────────────────────────────────
const spec = read("docs/openapi.yaml").split("\n");
const ops = new Map(); // path -> { verifyJwt, source, operationIds[] }
let current = null;
let inPaths = false;
for (const line of spec) {
  if (/^paths:\s*$/.test(line)) { inPaths = true; continue; }
  if (/^\S/.test(line)) { inPaths = false; current = null; continue; }
  if (!inPaths) continue;
  const p = line.match(/^ {2}(\/[^:]*):\s*$/);
  if (p) {
    current = { verifyJwt: undefined, source: undefined, operationIds: [] };
    ops.set(p[1], current);
    continue;
  }
  if (!current) continue;
  const jwt = line.match(/^\s+x-verify-jwt:\s*(true|false)\s*$/);
  if (jwt) current.verifyJwt = jwt[1] === "true";
  const src = line.match(/^\s+x-source:\s*(\S+)\s*$/);
  if (src) current.source = src[1];
  const id = line.match(/^\s+operationId:\s*(\S+)\s*$/);
  if (id) current.operationIds.push(id[1]);
}

// ── Code ───────────────────────────────────────────────────────────────
const fnDir = join(root, "supabase/functions");
const functions = readdirSync(fnDir).filter(
  (n) => !n.startsWith("_") && statSync(join(fnDir, n)).isDirectory(),
);

const config = read("supabase/config.toml");
const jwtSetting = new Map();
for (const m of config.matchAll(/\[functions\.([a-z0-9-]+)\]\s*\n\s*verify_jwt\s*=\s*(true|false)/g)) {
  jwtSetting.set(m[1], m[2] === "true");
}

for (const name of functions) {
  const op = ops.get(`/${name}`);
  if (!op) {
    problems.push(`supabase/functions/${name} has no path /${name} in docs/openapi.yaml`);
    continue;
  }
  const expected = jwtSetting.has(name) ? jwtSetting.get(name) : true;
  if (op.verifyJwt !== expected) {
    problems.push(`/${name}: x-verify-jwt is ${op.verifyJwt}, supabase/config.toml means ${expected}`);
  }
  const expectedSource = `supabase/functions/${name}/index.ts`;
  if (op.source !== expectedSource) {
    problems.push(`/${name}: x-source should be ${expectedSource}`);
  }
}

const sources = new Set([...ops.values()].map((o) => o.source).filter(Boolean));
for (const [path, op] of ops) {
  if (!op.source) problems.push(`${path}: missing x-source`);
  else if (!existsSync(join(root, op.source))) problems.push(`${path}: x-source ${op.source} does not exist`);
  if (op.source?.startsWith("supabase/functions/") && !functions.includes(path.slice(1))) {
    problems.push(`${path}: documented but supabase/functions${path} does not exist`);
  }
}

for (const file of readdirSync(join(root, "api")).filter((f) => /\.(js|ts|mjs)$/.test(f))) {
  if (!sources.has(`api/${file}`)) problems.push(`api/${file} is not the x-source of any operation`);
}

// Functions the app calls by name.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
for (const file of walk(join(root, "src"))) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\.invoke\(\s*["'`]([a-z0-9-]+)["'`]/g)) {
    if (!ops.has(`/${m[1]}`)) problems.push(`${file.slice(root.length)} calls ${m[1]}, which the spec lacks`);
  }
}

const seen = new Set();
for (const op of ops.values()) {
  for (const id of op.operationIds) {
    if (seen.has(id)) problems.push(`operationId ${id} is used twice`);
    seen.add(id);
  }
}

if (problems.length) {
  console.error(`API docs are out of step with the code (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `API docs match the code: ${functions.length} edge functions, ${ops.size} documented paths, ${seen.size} operations.`,
);
