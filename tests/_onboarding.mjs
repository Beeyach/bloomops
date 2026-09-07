import assert from "node:assert/strict";
import {
  testDb,
  testAuth,
  run,
  one,
  all,
  memoryMailer,
} from "./_bloomops-db.mjs";
import { runBootstrap } from "../lib/bloomops/bootstrap.mjs";
import { loadActor } from "../lib/bloomops/authorization.mjs";
import { resolveWorkspaceAccess } from "../lib/bloomops/membership.mjs";
import { activateClient } from "../lib/bloomops/client-activation.mjs";
import { acceptInvitation } from "../lib/bloomops/invitations.mjs";
import { mutateOnboardingItem } from "../lib/bloomops/onboarding-runtime.mjs";
import { onboardingView } from "../lib/bloomops/onboarding-views.mjs";

export async function setup({ auth = false, services = ["kajabi"] } = {}) {
  const t = auth ? testAuth() : testDb();
  await runBootstrap(t.d1, {
    workspaceName: "A10 Agency",
    owner: { email: "ellen@example.com", name: "Ellen" },
    admin: { email: "ary@example.com", name: "Ary" },
  });
  await runBootstrap(t.d1, {
    workspaceName: "Other Agency",
    owner: { email: "other@example.com" },
    admin: { email: "other-admin@example.com" },
  });
  t.ws = one(t.raw, "SELECT id FROM workspaces WHERE slug='a10-agency'").id;
  t.otherWs = one(
    t.raw,
    "SELECT id FROM workspaces WHERE slug='other-agency'",
  ).id;
  t.actor = async (email) =>
    loadActor(
      t.db,
      await resolveWorkspaceAccess(
        t.db,
        one(t.raw, "SELECT id FROM user WHERE email=?", email).id,
      ),
    );
  t.owner = await t.actor("ellen@example.com");
  t.admin = await t.actor("ary@example.com");
  t.person = async (id, role = "client", ws = t.ws) => {
    run(
      t.raw,
      "INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)",
      id,
      id,
      `${id}@example.com`,
    );
    run(
      t.raw,
      "INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,?,'active')",
      `${id}-member`,
      ws,
      id,
      role,
    );
    return t.actor(`${id}@example.com`);
  };
  t.addClient = (id, ws = t.ws) =>
    run(
      t.raw,
      "INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)",
      id,
      ws,
      id,
      id,
    );
  t.addClient("lawrence");
  t.addClient("james");
  t.addClient("foreign", t.otherWs);
  run(
    t.raw,
    "INSERT INTO client_contacts(id,workspace_id,client_id,name,email,is_primary) VALUES('lawrence-contact',?,'lawrence','Lawrence','lawrence@example.com',1)",
    t.ws,
  );
  for (const slug of services)
    run(
      t.raw,
      "INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) SELECT ?,?,'lawrence',id FROM service_types WHERE workspace_id=? AND slug=?",
      slug,
      t.ws,
      t.ws,
      slug,
    );
  const mailer = memoryMailer();
  assert.equal(
    (
      await activateClient(t.db, {
        actor: t.owner,
        clientId: "lawrence",
        mailer,
        appUrl: "http://localhost:3000",
        workspaceName: "A10 Agency",
      })
    ).deliveryStatus,
    "sent",
  );
  run(
    t.raw,
    "INSERT INTO user(id,name,email,email_verified) VALUES('lawrence-user','Lawrence','lawrence@example.com',1)",
  );
  const token = mailer.sent[0].text.match(/\/invite\/([A-Za-z0-9_-]+)/)[1];
  assert.equal(
    (
      await acceptInvitation(t.db, {
        token,
        user: { id: "lawrence-user", email: "lawrence@example.com" },
      })
    ).ok,
    true,
  );
  t.client = await t.actor("lawrence@example.com");
  t.instance = one(
    t.raw,
    "SELECT id FROM onboarding_instances WHERE client_id='lawrence'",
  ).id;
  t.item = (key) =>
    one(
      t.raw,
      "SELECT * FROM onboarding_items WHERE onboarding_instance_id=? AND logical_key=?",
      t.instance,
      key,
    );
  t.items = () =>
    all(
      t.raw,
      "SELECT * FROM onboarding_items WHERE onboarding_instance_id=? ORDER BY position",
      t.instance,
    );
  t.mutate = (key, operation = "submit", actor = t.client, extra = {}) =>
    mutateOnboardingItem(t.db, {
      actor,
      clientId: "lawrence",
      itemId: t.item(key).id,
      operation,
      ...extra,
    });
  t.view = () => onboardingView(t.db, t.client, "lawrence", { portal: true });
  t.extra = (
    id,
    {
      visibility = "internal",
      party = "team",
      required = true,
      verify = false,
      clientId = "lawrence",
      ws = t.ws,
      instanceId = t.instance,
    } = {},
  ) => {
    if (clientId !== "lawrence") {
      instanceId = `${id}-instance`;
      run(
        t.raw,
        "INSERT INTO onboarding_instances(id,workspace_id,client_id) VALUES(?,?,?)",
        instanceId,
        ws,
        clientId,
      );
    }
    run(
      t.raw,
      "INSERT INTO onboarding_items(id,workspace_id,onboarding_instance_id,logical_key,title,instructions,visibility,responsible_party,required,verification_required) VALUES(?,?,?,?,?,?,?,?,?,?)",
      id,
      ws,
      instanceId,
      id,
      id,
      `${id} instructions`,
      visibility,
      party,
      +required,
      +verify,
    );
    return id;
  };
  return t;
}
export const snapshot = (t) =>
  [
    "onboarding_items",
    "onboarding_instances",
    "bloomops_clients",
    "onboarding_item_submissions",
    "onboarding_item_resolutions",
    "activity_events",
  ].map((table) => all(t.raw, `SELECT * FROM ${table} ORDER BY rowid`));
export const eventCount = (t, type) =>
  one(
    t.raw,
    "SELECT count(*) AS n FROM activity_events WHERE event_type=?",
    type,
  ).n;
