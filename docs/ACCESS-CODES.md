# Access codes and workspaces

The app is gated: nothing loads without a valid access code. A code IS the
account. It maps to a workspace and a role. There are no usernames or
passwords to manage beyond the codes themselves.

## Two Cloudflare secrets (set these before go-live)

In the Cloudflare Pages dashboard: **Settings → Environment variables →
Production**, add two **encrypted** variables. They live only in Cloudflare,
never in the repo, and are not readable from the app code.

### `LTB_ACCESS_CODES`

JSON mapping each code to a workspace and role:

```json
{
  "honeypetalbee": { "workspace": "ary", "role": "admin" },
  "ellen-quiet-garden-42": { "workspace": "ellen", "role": "user" },
  "some-random-code-here": { "workspace": "client3", "role": "user" }
}
```

- `workspace` — which data set this code opens. Same workspace = same data.
  Different workspace = a separate, isolated set of leads, pages, settings.
- `role` — `admin` can edit the locked guide pages; `user` cannot.
- Codes are matched loosely (case and punctuation are ignored), so
  `Honey-Petal-Bee` and `honeypetalbee` are the same code.
- To add a person: add a line with a new random code and a new workspace
  name. To revoke: delete their line. To reset someone: change their code.

### `LTB_SESSION_SECRET`

Any long random string (e.g. from a password generator). Used to sign the
login cookie so it cannot be forged. Changing it logs everyone out.

## Behavior

- **No config in production = locked.** If `LTB_ACCESS_CODES` is missing or
  invalid on the live site, every code is rejected. It never falls back to
  the dev code in production.
- **Local dev** (`npm run dev`) falls back to a single dev code:
  `honeypetalbee` (admin). This is only for your machine.

## What this phase does and does not do yet

Done: the gate (no access without a code), signed sessions, admin/user
roles in the token, log out.

Not yet (next phases): the per-workspace data isolation is not wired into
every table yet, so today all codes still read the same database. Encrypted
per-workspace API keys and the 30-day trash are also still to come. Do not
hand a code to a second person until workspace isolation ships.
