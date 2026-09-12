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
import { resolveWorkspaceAccess } from "../lib/bloomops/membership.mjs";
import { createClient } from "../lib/bloomops/clients.mjs";
import { createServiceEngagement } from "../lib/bloomops/services.mjs";
import { addClientAssignment } from "../lib/bloomops/assignments.mjs";
import { activateClient } from "../lib/bloomops/client-activation.mjs";
import { acceptInvitation } from "../lib/bloomops/invitations.mjs";
import { portalOnboarding } from "../lib/bloomops/onboarding-views.mjs";
import { configureOnboardingItem } from "../lib/bloomops/onboarding-guidance.mjs";
import { mutateOnboardingItem } from "../lib/bloomops/onboarding-runtime.mjs";
const temp = mkdtempSync(join(tmpdir(), "bloomops-a10-smoke-"));
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
      name: "bloomops-a10-local-smoke",
      compatibility_date: "2025-05-01",
      d1_databases: [
        {
          binding: "DB",
          database_name: "a10-disposable-local",
          database_id: "a10-disposable-local",
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
    "all 22 domain migrations apply on real D1",
    journal.entries.length === 22,
  );
  await runBootstrap(d1, {
    workspaceName: "A10 Agency",
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
  const made = await createClient(db, {
    workspaceId: ws,
    input: {
      name: "Lawrence",
      contactName: "Lawrence",
      contactEmail: "lawrence@example.com",
    },
    actorMembershipId: owner.membershipId,
  });
  check("Ellen creates Lawrence through canonical client primitive", made.ok);
  const clientId = made.clientId;
  const service = await createServiceEngagement(db, {
    workspaceId: ws,
    clientId,
    input: {
      serviceTypeId: (
        await one("SELECT id FROM service_types WHERE slug='kajabi'")
      ).id,
    },
  });
  check("Kajabi purchased service created", service.ok);
  check(
    "Ary assigned through canonical assignment primitive",
    (
      await addClientAssignment(db, {
        workspaceId: ws,
        clientId,
        input: { membershipId: admin.membershipId },
      })
    ).ok,
  );
  const mail = [];
  const activation = await activateClient(db, {
    actor: owner,
    clientId,
    mailer: { send: async (m) => mail.push(m) },
    appUrl: "http://localhost:8787",
    workspaceName: "A10 Agency",
  });
  check(
    "activation delivered only to memory",
    activation.deliveryStatus === "sent" && mail.length === 1,
  );
  check(
    "Common and Kajabi generated",
    (await one("SELECT count(*) AS n FROM onboarding_instance_templates")).n ===
      2,
  );
  await run(
    "INSERT INTO user(id,name,email,email_verified) VALUES('lawrence','Lawrence','lawrence@example.com',1)",
  );
  const token = mail[0].text.match(/\/invite\/([A-Za-z0-9_-]+)/)[1];
  check(
    "Lawrence accepts explicit A9 invitation",
    (
      await acceptInvitation(db, {
        token,
        user: { id: "lawrence", email: "lawrence@example.com" },
      })
    ).ok,
  );
  const client = await actorFor("lawrence@example.com");
  for (const row of await all("SELECT i.* FROM onboarding_items i JOIN onboarding_instances n ON n.id=i.onboarding_instance_id WHERE n.client_id=?", clientId)) {
    check('agency configures runtime instructions on D1', (await configureOnboardingItem(db, { actor: owner, clientId, itemId: row.id,
      input: { revision: 0, actionType: 'confirmation', actionUrl: null, instructions: row.instructions || 'Complete the agreed external work.' } })).ok);
  }
  let view = (await portalOnboarding(db, client))[0];
  check(
    "portal read projects four required Client steps",
    view.id === clientId && view.onboarding.progress.total === 4,
  );
  const mutation = (itemId, operation = "submit", actor = client) =>
    mutateOnboardingItem(db, { actor, clientId, itemId, operation, guidanceRevision: 1 });
  const required = view.onboarding.items.filter((i) => i.required),
    access = required.find((i) => i.verificationRequired);
  await Promise.all(
    required.map(async (item) =>
      check(`Client fulfills ${item.title}`, (await mutation(item.id)).ok),
    ),
  );
  view = (await portalOnboarding(db, client))[0];
  check(
    "your steps reaches 100 while verification remains open",
    view.onboarding.progress.percent === 100 &&
      view.onboarding.state === "open",
  );
  check(
    "submitted access is durable and not completed",
    (
      await one(
        "SELECT status,completed_at FROM onboarding_items WHERE id=?",
        access.id,
      )
    ).status === "in_progress" &&
      (await one(
        "SELECT * FROM onboarding_item_submissions WHERE onboarding_item_id=?",
        access.id,
      )),
  );
  // Late completion failure must roll back the entire final transition.
  await run(
    "CREATE TRIGGER a10_late BEFORE INSERT ON activity_events WHEN NEW.event_type='CLIENT_ONBOARDING_COMPLETED' BEGIN SELECT RAISE(ABORT,'forced late failure'); END",
  );
  await assert.rejects(mutation(access.id, "verify", admin));
  check(
    "late D1 failure preserves pending verification",
    (await one("SELECT status FROM onboarding_items WHERE id=?", access.id))
      .status === "in_progress",
  );
  check(
    "late D1 failure preserves onboarding client lifecycle",
    (
      await one(
        "SELECT relationship_status FROM bloomops_clients WHERE id=?",
        clientId,
      )
    ).relationship_status === "onboarding",
  );
  check(
    "late D1 failure appends no completion event",
    (
      await one(
        "SELECT count(*) AS n FROM activity_events WHERE event_type='ONBOARDING_COMPLETED'",
      )
    ).n === 0,
  );
  await run("DROP TRIGGER a10_late");
  const results = await Promise.all([
    mutation(access.id, "verify", admin),
    mutation(access.id, "verify", admin),
  ]);
  check(
    "concurrent Ary verification converges",
    results.every((r) => r.ok),
  );
  check(
    "onboarding completes",
    (await portalOnboarding(db, client))[0].onboarding.state === "complete",
  );
  check(
    "Lawrence becomes Active",
    (
      await one(
        "SELECT relationship_status FROM bloomops_clients WHERE id=?",
        clientId,
      )
    ).relationship_status === "active",
  );
  for (const type of [
    "ONBOARDING_ITEM_VERIFIED",
    "ONBOARDING_COMPLETED",
    "CLIENT_ONBOARDING_COMPLETED",
  ])
    check(
      `${type} is singular`,
      (
        await one(
          "SELECT count(*) AS n FROM activity_events WHERE event_type=?",
          type,
        )
      ).n === 1,
    );
  check(
    "optional Course videos remains pending",
    (
      await one(
        "SELECT status FROM onboarding_items WHERE logical_key='course_videos'",
      )
    ).status === "pending",
  );
  const before = await all("SELECT * FROM activity_events");
  check(
    "response-loss retry is idempotent",
    (await mutation(access.id, "verify", admin)).unchanged,
  );
  check(
    "retry adds no events",
    JSON.stringify(before) ===
      JSON.stringify(await all("SELECT * FROM activity_events")),
  );
  check(
    "service lifecycle is unchanged",
    (await one("SELECT status FROM service_engagements")).status === "planned",
  );
  console.log(`A10 local D1 smoke: ${checks} checks passed`);
} finally {
  await proxy?.dispose();
  rmSync(temp, { recursive: true, force: true });
}
