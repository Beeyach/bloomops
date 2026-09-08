// Makes sure the BloomOps staging D1 database and R2 bucket exist on the
// authenticated Cloudflare account, then pins the staging database_id in this
// checkout's wrangler.jsonc so the deploy that follows binds the right database.
//
// Staging only. Names are fixed here and checked against wrangler.jsonc, so this
// script cannot be pointed at another environment or another product's
// resources. `--check` validates the config without calling Cloudflare.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const DB_NAME = 'bloomops-staging';
const BUCKET = 'bloomops-files-staging';
const WORKER = 'bloomops-staging';
const PLACEHOLDER = 'REPLACE_WITH_BLOOMOPS_STAGING_D1_ID';
const CONFIG = 'wrangler.jsonc';
const CHECK_ONLY = process.argv.includes('--check');

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

function note(msg) {
  console.log(`::notice::${msg}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${msg}\n`);
}

// wrangler prints a banner before its JSON and colours it, so strip ANSI escape
// sequences and start at the first bracket or brace.
function wranglerJson(args) {
  const out = execFileSync('npx', ['--no-install', 'wrangler', ...args, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const text = out.replace(/\x1b\[[0-9;]*m/g, '');
  const starts = ['[', '{'].map((c) => text.indexOf(c)).filter((i) => i >= 0);
  if (!starts.length) fail(`wrangler ${args.join(' ')} returned no JSON`);
  return JSON.parse(text.slice(Math.min(...starts)));
}

function wrangler(args) {
  execFileSync('npx', ['--no-install', 'wrangler', ...args], { encoding: 'utf8', stdio: 'inherit' });
}

function readConfig() {
  const raw = readFileSync(CONFIG, 'utf8');
  const parsed = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ''));
  return { raw, parsed };
}

function checkConfig({ parsed }) {
  // Comments may mention Leadsthatbloom by name; resource identifiers may not.
  if (/bloomtrack|412a33ad|bloomwired|leadsthatbloom/i.test(JSON.stringify(parsed))) {
    fail(`${CONFIG} names a Leadsthatbloom resource. Refusing to continue.`);
  }
  const s = parsed?.env?.staging;
  if (!s) fail(`${CONFIG} has no env.staging block.`);
  if (s.name !== WORKER) fail(`env.staging.name must be ${WORKER}, found ${s.name}`);
  if (s.d1_databases?.length !== 1 || s.r2_buckets?.length !== 1) fail('staging must declare exactly its one D1 and one R2 binding.');
  if (s.vars?.BLOOMOPS_ENV !== 'staging' || s.vars?.BLOOMOPS_APP_URL !== 'https://bloomops-staging.cool-sunset-2169.workers.dev') fail('staging environment and app origin must identify the staging Worker.');
  const d1 = s.d1_databases?.[0];
  const r2 = s.r2_buckets?.[0];
  if (!d1 || d1.binding !== 'DB' || d1.database_name !== DB_NAME) {
    fail(`env.staging.d1_databases[0] must bind DB to ${DB_NAME}`);
  }
  if (!r2 || r2.binding !== 'FILES' || r2.bucket_name !== BUCKET) {
    fail(`env.staging.r2_buckets[0] must bind FILES to ${BUCKET}`);
  }
  const prod = parsed?.env?.production?.d1_databases?.[0]?.database_id || '';
  if (d1.database_id && d1.database_id === prod) {
    fail('staging and production name the same database_id. Refusing to continue.');
  }
  return d1.database_id;
}

const cfg = readConfig();
const configuredId = checkConfig(cfg);
console.log(`config ok: Worker ${WORKER}, D1 ${DB_NAME}, R2 ${BUCKET}`);
if (CHECK_ONLY) process.exit(0);

// D1: find by name, create if missing.
let db = wranglerJson(['d1', 'list']).find((d) => d.name === DB_NAME);
if (!db) {
  console.log(`creating D1 database ${DB_NAME}`);
  wrangler(['d1', 'create', DB_NAME]);
  db = wranglerJson(['d1', 'list']).find((d) => d.name === DB_NAME);
  if (!db) fail(`created ${DB_NAME} but cannot find it in wrangler d1 list`);
}
const uuid = db.uuid || db.id;
if (!uuid) fail(`no id returned for ${DB_NAME}`);

// R2: info succeeds when the bucket exists.
let bucketExists = true;
try {
  wranglerJson(['r2', 'bucket', 'info', BUCKET]);
} catch {
  bucketExists = false;
}
if (!bucketExists) {
  console.log(`creating R2 bucket ${BUCKET}`);
  wrangler(['r2', 'bucket', 'create', BUCKET]);
}

// Pin the id. A committed placeholder is replaced for this run only. A committed
// real id must match the account's database of that name.
if (configuredId === PLACEHOLDER) {
  writeFileSync(CONFIG, cfg.raw.replace(PLACEHOLDER, uuid));
  note(`staging database_id pinned for this run: ${uuid}. Commit it to wrangler.jsonc under env.staging to make it permanent.`);
} else if (configuredId !== uuid) {
  fail(`wrangler.jsonc env.staging database_id (${configuredId}) does not match the account's ${DB_NAME} (${uuid}).`);
} else {
  note(`staging database_id in wrangler.jsonc matches the account: ${uuid}`);
}
note(`staging R2 bucket ${BUCKET}: ${bucketExists ? 'exists' : 'created'}`);
