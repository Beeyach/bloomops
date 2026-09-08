#!/usr/bin/env node
// Release A on disposable local workerd D1. No account credentials, remote
// bindings, existing data or real email. HTTP/browser acceptance is separate.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../lib/bloomops/schema.mjs";
import { runBootstrap } from "../lib/bloomops/bootstrap.mjs";
import { loadActor } from "../lib/bloomops/authorization.mjs";
import {
  resolveWorkspaceAccess,
  setMembershipStatus,
} from "../lib/bloomops/membership.mjs";
import {
  createClient,
  getClient,
  updateClient,
  listClients,
} from "../lib/bloomops/clients.mjs";
import { createServiceEngagement } from "../lib/bloomops/services.mjs";
import {
  activateClient,
  activationSummary,
} from "../lib/bloomops/client-activation.mjs";
import {
  createInvitation,
  acceptInvitation,
  resendInvitation,
  revokeInvitation,
  lookupInvitation,
  INVITATION_TTL_MS,
} from "../lib/bloomops/invitations.mjs";
import {
  updateContact,
  removeContact,
} from "../lib/bloomops/client-contacts.mjs";
const temp = mkdtempSync(join(tmpdir(), "bloomops-a11-smoke-"));
let proxy,
  checks = 0;
const check = (name, value) => {
  assert.ok(value, name);
  checks++;
  console.log(`ok   ${name}`);
};
try {
  const configPath = join(temp, "wrangler.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      name: "bloomops-a11-local-smoke",
      compatibility_date: "2025-05-01",
      d1_databases: [
        {
          binding: "DB",
          database_name: "a11-disposable-local",
          database_id: "a11-disposable-local",
        },
      ],
    }),
  );
  proxy = await getPlatformProxy({
    configPath,
    persist: false,
    remoteBindings: false,
    envFiles: [],
  });
  const d1 = proxy.env.DB,
    db = drizzle(d1, { schema });
  const run = (q, ...args) =>
    d1
      .prepare(q)
      .bind(...args)
      .run();
  const one = (q, ...args) =>
    d1
      .prepare(q)
      .bind(...args)
      .first();
  const all = async (q, ...args) =>
    (
      await d1
        .prepare(q)
        .bind(...args)
        .all()
    ).results;
  const journal = JSON.parse(
    readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url)),
  );
  for (const { tag } of journal.entries)
    for (const statement of readFileSync(
      new URL(`../drizzle/${tag}.sql`, import.meta.url),
      "utf8",
    ).split("--> statement-breakpoint"))
      if (statement.trim()) await run(statement.trim());
  check(
    "all eight domain migrations apply on real D1",
    journal.entries.length === 8,
  );
  await runBootstrap(d1, {
    workspaceName: "A11 Agency",
    owner: { email: "ellen@example.com" },
    admin: { email: "ary@example.com" },
  });
  const ws = (await one("SELECT id FROM workspaces")).id;
  const actorFor = async (email) =>
    loadActor(
      db,
      await resolveWorkspaceAccess(
        db,
        (await one("SELECT id FROM user WHERE email=?", email)).id,
      ),
    );
  const owner = await actorFor("ellen@example.com"),
    admin = await actorFor("ary@example.com");
  const user = { id: "invited", email: "invited@example.com" };
  await run(
    "INSERT INTO user(id,name,email) VALUES(?,?,?)",
    user.id,
    "Invited",
    user.email,
  );
  const invite = await createInvitation(db, {
    workspaceId: ws,
    email: user.email,
    role: "team_member",
  });
  const options = { workspaceId: ws, invitationId: invite.invitation.id };
  const snapshot = async () =>
    JSON.stringify(
      await Promise.all(
        [
          "workspace_memberships",
          "workspace_invitations",
          "activity_events",
        ].map((t) => all(`SELECT * FROM ${t} ORDER BY rowid`)),
      ),
    );
  const before = await snapshot();
  await run(
    "CREATE TRIGGER fail_late BEFORE INSERT ON activity_events WHEN NEW.event_type='MEMBERSHIP_CREATED' BEGIN SELECT RAISE(ABORT,'local injected failure'); END",
  );
  await assert.rejects(acceptInvitation(db, { token: invite.token, user }));
  check(
    "late generic acceptance failure rolls back every row on D1",
    (await snapshot()) === before,
  );
  await run("DROP TRIGGER fail_late");
  for (const [operation, event] of [
    ["resend", "INVITATION_RESENT"],
    ["revoke", "INVITATION_REVOKED"],
    ["expire", "INVITATION_EXPIRED"],
  ]) {
    await run(
      `CREATE TRIGGER fail_late BEFORE INSERT ON activity_events WHEN NEW.event_type='${event}' BEGIN SELECT RAISE(ABORT,'local injected failure'); END`,
    );
    await assert.rejects(
      operation === "resend"
        ? resendInvitation(db, options)
        : operation === "revoke"
          ? revokeInvitation(db, options)
          : lookupInvitation(db, invite.token, {
              now: new Date(Date.now() + INVITATION_TTL_MS + 1000),
            }),
    );
    check(
      `${operation} event failure rolls back token and status on D1`,
      (await snapshot()) === before,
    );
    await run("DROP TRIGGER fail_late");
  }
  const batch = db.batch.bind(db);
  let armed = true;
  db.batch = async (writes) => {
    if (armed) {
      armed = false;
      await resendInvitation(db, options);
    }
    return batch(writes);
  };
  check(
    "rotation winning before acceptance refuses the old token on D1",
    !(await acceptInvitation(db, { token: invite.token, user })).ok,
  );
  check(
    "stale token granted no membership",
    (
      await one(
        "SELECT count(*) n FROM workspace_memberships WHERE user_id=?",
        user.id,
      )
    ).n === 0,
  );
  db.batch = batch;
  const current = await resendInvitation(db, options);
  const accepts = await Promise.all(
    [1, 2, 3, 4].map(() =>
      acceptInvitation(db, { token: current.token, user }),
    ),
  );
  check(
    "concurrent D1 acceptance converges to the same membership",
    accepts.every((r) => r.ok) &&
      new Set(accepts.map((r) => r.membership.id)).size === 1,
  );
  check(
    "D1 acceptance appends one semantic fact",
    (
      await one(
        "SELECT count(*) n FROM activity_events WHERE event_type='INVITATION_ACCEPTED'",
      )
    ).n === 1,
  );
  const other = await createInvitation(db, {
    workspaceId: ws,
    email: "revoke@example.com",
    role: "team_member",
  });
  check(
    "ordinary invitations can still be revoked",
    (
      await revokeInvitation(db, {
        workspaceId: ws,
        invitationId: other.invitation.id,
      })
    ).ok,
  );
  await run(
    "INSERT INTO user(id,name,email) VALUES('owner2','Other Owner','other@example.com')",
  );
  await run(
    "INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('owner2-member',?,'owner2','owner','active')",
    ws,
  );
  const owners = await all(
    "SELECT id FROM workspace_memberships WHERE role='owner'",
  );
  const suspensions = await Promise.all(
    owners.map((o) =>
      setMembershipStatus(db, {
        workspaceId: ws,
        membershipId: o.id,
        status: "suspended",
        actorMembership: { role: "admin" },
      }),
    ),
  );
  check(
    "concurrent D1 owner suspensions preserve one active Owner",
    suspensions.filter((r) => r.ok).length === 1 &&
      (
        await one(
          "SELECT count(*) n FROM workspace_memberships WHERE role='owner' AND status='active'",
        )
      ).n === 1,
  );
  // Restore this disposable test actor for the independent lifecycle checks.
  await run(
    "UPDATE workspace_memberships SET status='active' WHERE id=?",
    owner.membershipId,
  );
  const made = await createClient(db, {
    workspaceId: ws,
    input: {
      name: "Lawrence",
      contactName: "Lawrence",
      contactEmail: "lawrence@example.com",
    },
  });
  const clientId = made.clientId;
  const retarget = await createInvitation(db, {
    workspaceId: ws,
    email: "retarget@example.com",
    role: "team_member",
  });
  let retargetArmed = true;
  db.batch = async (writes) => {
    if (retargetArmed) {
      retargetArmed = false;
      await createInvitation(db, {
        workspaceId: ws,
        email: "retarget@example.com",
        role: "client",
        clientId,
      });
    }
    return batch(writes);
  };
  try {
    check(
      "stale D1 revoke refuses a retargeted invitation without a misleading event",
      !(
        await revokeInvitation(db, {
          workspaceId: ws,
          invitationId: retarget.invitation.id,
        })
      ).ok &&
        (
          await one(
            "SELECT count(*) n FROM activity_events WHERE subject_id=? AND event_type='INVITATION_REVOKED'",
            retarget.invitation.id,
          )
        ).n === 0,
    );
  } finally {
    db.batch = batch;
  }

  await createServiceEngagement(db, {
    workspaceId: ws,
    clientId,
    input: {
      serviceTypeId: (
        await one("SELECT id FROM service_types WHERE slug='kajabi'")
      ).id,
    },
  });
  const sent = [],
    now = new Date(),
    mailer = {
      send: async (m) => {
        sent.push(m);
      },
    };
  const activationOptions = {
    actor: owner,
    clientId,
    mailer,
    appUrl: "http://localhost:8787",
    workspaceName: "A11 Agency",
  };
  check(
    "activation delivers locally",
    (await activateClient(db, { ...activationOptions, now })).deliveryStatus ===
      "sent",
  );
  const invitation = (
    await one(
      "SELECT invitation_id FROM client_activations WHERE client_id=?",
      clientId,
    )
  ).invitation_id;
  for (const operation of [resendInvitation, revokeInvitation])
    check(
      "activation-managed generic operation refused on D1",
      (await operation(db, { workspaceId: ws, invitationId: invitation }))
        .reason === "activation_managed",
    );
  const late = new Date(now.getTime() + INVITATION_TTL_MS + 1000);
  check(
    "expired delivered invitation becomes retryable",
    (await activationSummary(db, ws, clientId, { now: late })).retryAvailable,
  );
  const renewals = await Promise.all(
    [1, 2, 3].map(() =>
      activateClient(db, { ...activationOptions, now: late, retryOnly: true }),
    ),
  );
  check(
    "concurrent expiry recovery sends exactly one replacement",
    sent.length === 2 && renewals.some((r) => r.deliveryStatus === "sent"),
  );
  for (const event of [
    "CLIENT_ACTIVATED",
    "ONBOARDING_STARTED",
    "CLIENT_INVITED",
  ])
    check(
      `${event} remains singular after renewal`,
      (
        await one(
          "SELECT count(*) n FROM activity_events WHERE client_id=? AND event_type=?",
          clientId,
          event,
        )
      ).n === 1,
    );
  const client = await getClient(db, owner, clientId);
  const edits = await Promise.all(
    [1, 2].map(() =>
      updateClient(db, {
        workspaceId: ws,
        client,
        input: { health: "at_risk" },
      }),
    ),
  );
  check(
    "duplicate D1 client edit records one change",
    edits.some((r) => r.ok) &&
      (
        await one(
          "SELECT count(*) n FROM activity_events WHERE client_id=? AND event_type='CLIENT_HEALTH_CHANGED'",
          clientId,
        )
      ).n === 1,
  );
  const contact = (
    await one("SELECT id FROM client_contacts WHERE client_id=?", clientId)
  ).id;
  const contacts = await Promise.all(
    [1, 2].map(() =>
      updateContact(db, {
        workspaceId: ws,
        clientId,
        contactId: contact,
        input: { name: "Updated Lawrence" },
      }),
    ),
  );
  check(
    "duplicate D1 contact edit records one change",
    contacts.some((r) => r.ok) &&
      (
        await one(
          "SELECT count(*) n FROM activity_events WHERE client_id=? AND event_type='CLIENT_CONTACT_UPDATED'",
          clientId,
        )
      ).n === 1,
  );
  await run(
    "INSERT INTO client_contacts(id,workspace_id,client_id,name) VALUES('remove-contact',?,?,'Other')",
    ws,
    clientId,
  );
  await Promise.all(
    [1, 2].map(() =>
      removeContact(db, {
        workspaceId: ws,
        clientId,
        contactId: "remove-contact",
      }),
    ),
  );
  check(
    "duplicate D1 contact deletion records one removal",
    (
      await one(
        "SELECT count(*) n FROM activity_events WHERE client_id=? AND event_type='CLIENT_CONTACT_REMOVED'",
        clientId,
      )
    ).n === 1,
  );
  check(
    "D1 foreign-key integrity remains valid",
    (await all("PRAGMA foreign_key_check")).length === 0,
  );
  for (let n = 0; n < 205; n++)
    await run(
      "INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)",
      `page-${n}`,
      ws,
      `Page ${String(n).padStart(3, "0")}`,
      `page-${n}`,
    );
  check(
    "the supported 200-client page reads successfully on actual D1",
    (await listClients(db, owner)).clients.length === 200,
  );
  for (let n = 0; n < 205; n++)
    await run(
      "INSERT INTO client_assignments(id,workspace_id,client_id,membership_id) VALUES(?,?,?,?)",
      `assignment-${n}`,
      ws,
      `page-${n}`,
      accepts[0].membership.id,
    );
  const assigned = await actorFor(user.email),
    page = await listClients(db, assigned);
  check(
    "large assignment scope stays within the D1 limit and cannot leak unassigned clients",
    page.clients.length === 200 &&
      page.total === 205 &&
      page.clients.every((c) => c.id.startsWith("page-")),
  );
  console.log(`A11 local D1 hardening: ${checks} checks passed`);
} finally {
  await proxy?.dispose();
  rmSync(temp, { recursive: true, force: true });
}
