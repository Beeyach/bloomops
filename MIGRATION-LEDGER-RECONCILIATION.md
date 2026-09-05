# Migration ledger reconciliation

Production D1 `bloomtrack-pro`. Reconciled 2026-08-10.

**Outcome: 47 of 47 migrations proven applied and recorded. The runner is clean.**

---

## The state before

| | |
|---|---|
| Live schema | effectively 047 |
| `_migrations` ledger | stopped at **019** |
| `scripts/migrate.mjs --remote` | failed, appearing to replay 001 |
| Migration 047 | applied directly, verified by query |

28 migrations had run without being recorded. Nothing could safely be added on
top of a runner in that state.

---

## The method: verification, not inference

> ⚠️ **"The app works" is not evidence a migration ran.** It proves the columns
> the app reads exist. It proves nothing about an index nothing has queried yet,
> a table only a future feature touches, or a migration that failed halfway.

`scripts/ledger-audit.mjs` reads every migration, extracts what it **promises**
the schema will contain afterwards, and checks each promise against production.

**Postconditions extracted** (only what sqlite's own catalogues can confirm):

- `CREATE TABLE` → the table exists
- `ALTER TABLE ... ADD COLUMN` → the column exists
- `CREATE INDEX` → the index exists
- `ALTER TABLE ... RENAME TO` → the destination exists

Deliberately **not** claimed: CHECK constraints inside a CREATE TABLE, defaults,
and anything else not separately inspectable. An unverifiable promise is not
counted as kept.

**Verdicts:**

| Verdict | Meaning | May be recorded |
|---|---|---|
| `PROVEN_APPLIED` | every postcondition present | **yes** |
| `PARTIALLY_APPLIED` | some present, some missing | **no** |
| `NOT_APPLIED` | none present | **no** |
| `CANNOT_PROVE` | nothing inspectable to check | **no** |

The tool refuses to write anything if a single migration is unproven, and there
is a regression test asserting that refusal.

---

## One false positive, and what it taught

The first run flagged **004_workspaces.sql** as `PARTIALLY_APPLIED`, missing a
table called `settings_new`.

That table is supposed to be gone. sqlite has no `ALTER COLUMN`, so changing one
means build-copy-rename-drop, and 004 does exactly that:

```sql
CREATE TABLE settings_new (...);
INSERT INTO settings_new SELECT ... FROM settings;
DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;
```

Scaffolding, not a postcondition. Its absence is the migration **working**.

The extractor now removes tables that are later renamed or dropped, and adds the
rename destination instead. Both behaviours have tests.

This is the reason the exercise was worth doing properly: a naive tool would
have reported real drift where there was none, and a careless operator would
have "fixed" a schema that was already correct.

---

## Results

| Range | Verdict | In ledger before | Now |
|---|---|---|---|
| 001 to 019 | PROVEN_APPLIED | yes | yes |
| **020 to 046** | **PROVEN_APPLIED** | **no** | **recorded** |
| 047 | PROVEN_APPLIED | no | recorded |

**47 migrations. 47 proven applied. 0 partial. 0 not applied. 0 unprovable.**

Every one of the 28 missing entries was proven before it was written. Nothing
was recorded on the strength of "it probably ran".

Sample of what was checked: 047 alone had **62 postconditions** (21 prospect
columns, 8 package columns, 24 send_events columns, 1 table, indexes) and all 62
were present.

---

## Safety

**Backup taken first:** `wrangler d1 export --remote` to
`backups/pre-ledger-repair.sql`, 19.3 MB, before any write. The `backups/`
directory is gitignored.

**Nothing was replayed.** No migration SQL was re-executed against production.
The only write was `INSERT OR IGNORE INTO _migrations` for 28 proven names.

---

## ⚠️ Two real bugs in the runner, found on the way

The ledger drift explained why entries were missing. It did **not** explain why
`migrate.mjs --remote` still failed after the ledger was correct. Two separate
defects, both in `scripts/migrate.mjs`:

### 1. The wrangler banner broke every parse

`JSON.parse(out)` threw on every call, because wrangler prints a version banner
before its JSON. The throw was swallowed and `[]` returned.

So the runner read the ledger as **empty every single time**, concluded no
migration had ever run, tried to replay 001 against a live database, and failed
on the first `CREATE`. That reported as "migration failed", which reads as a
database problem and was a parser problem.

**A migration runner that could never succeed on a database that had ever been
migrated, which is every database it is for.**

### 2. `--file` and `--command` return different shapes

A file execution reports a summary (`Total queries executed: 1`). Only
`--command` returns actual rows. The runner sent everything through a temp file,
including `SELECT name FROM _migrations`, so even with the banner fixed the
ledger read as a summary object rather than names.

**Fixed:** queries go through `--command`, migration SQL keeps going through
`--file` (multi-statement SQL through `--command` gets word-split by cmd.exe on
Windows). Each path is used for what it is good at.

These two bugs are almost certainly *why* the ledger drifted in the first place:
the runner never worked, so migrations were applied by hand, so nothing recorded
them.

---

## Verification

```
$ node scripts/ledger-audit.mjs
47 migrations, 47 in the ledger.
47 proven applied.
Ledger is already correct.

$ node scripts/migrate.mjs --remote
applied: (none)
already applied: 001_clients.sql ... 047_strategy_v2.sql
```

Nothing pending. Nothing replayed. Migration 048 is now safe to create.

---

## Future drift detection

`scripts/ledger-audit.mjs` is the tool. Run it before adding a migration and
after any manual schema work. Its classification logic is unit-tested in
`tests/stabilization.test.mjs`, including the refusal to record a partial
migration and the rename-scaffolding case.
