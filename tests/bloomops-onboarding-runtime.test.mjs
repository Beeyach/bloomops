import "./_jsx.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { run, one, all, APP_URL } from "./_bloomops-db.mjs";
import { setup, snapshot, eventCount } from "./_onboarding.mjs";
import { mutateOnboardingItem } from "../lib/bloomops/onboarding-runtime.mjs";
import {
  onboardingView,
  portalOnboarding,
} from "../lib/bloomops/onboarding-views.mjs";

const saved = (result) => assert.equal(result.ok, true, JSON.stringify(result));
const ownRequired = (t) =>
  t
    .items()
    .filter(
      (i) =>
        i.required &&
        i.responsible_party === "client" &&
        i.visibility === "client",
    );
async function doClientSteps(t) {
  for (const item of ownRequired(t)) saved(await t.mutate(item.logical_key));
}

test("accepted Client sees only safe projection; hidden work never changes your-steps denominator", async () => {
  const t = await setup();
  t.extra("internal_secret");
  t.extra("restricted_secret", { visibility: "restricted" });
  t.extra("team_visible", { visibility: "client" });
  const view = await t.view();
  assert.equal(view.progress.total, 4);
  assert.equal(view.items.length, 6);
  const payload = JSON.stringify(view);
  assert.doesNotMatch(
    payload,
    /internal_secret|restricted_secret|logicalKey|workspaceId|MembershipId|template|resolutionReason|onboardingInstanceId|responsibleParty/,
  );
  assert.equal(view.items.find((i) => i.id === "team_visible").canAct, false);
  assert.equal(
    one(
      t.raw,
      "SELECT started_at FROM onboarding_instances WHERE id=?",
      t.instance,
    ).started_at,
    null,
  );
  await doClientSteps(t);
  const refreshed = await t.view();
  assert.equal(refreshed.progress.percent, 100);
  assert.equal(refreshed.state, "open");
  assert.equal(
    refreshed.items.find((i) => i.id === t.item("kajabi_access").id).state,
    "awaiting_verification",
  );
  assert.equal(t.item("course_videos").status, "pending");
});
test("client completion, durable submission, internal verification, and final lifecycle are atomic and idempotent", async () => {
  const t = await setup();
  const services = all(t.raw, "SELECT * FROM service_engagements");
  saved(await t.mutate("agreement"));
  assert.equal(
    t.item("agreement").completed_by_membership_id,
    t.client.membershipId,
  );
  assert.equal(
    one(t.raw, "SELECT status FROM onboarding_instances WHERE id=?", t.instance)
      .status,
    "in_progress",
  );
  assert.ok(
    one(
      t.raw,
      "SELECT started_at FROM onboarding_instances WHERE id=?",
      t.instance,
    ).started_at,
  );
  await doClientSteps(t);
  const access = t.item("kajabi_access");
  assert.equal(access.status, "in_progress");
  assert.equal(access.completed_at, null);
  assert.equal(access.verified_at, null);
  assert.equal(
    one(
      t.raw,
      "SELECT submitted_by_membership_id FROM onboarding_item_submissions",
    ).submitted_by_membership_id,
    t.client.membershipId,
  );
  const before = snapshot(t);
  saved(await t.mutate("kajabi_access"));
  assert.deepEqual(snapshot(t), before);
  saved(await t.mutate("kajabi_access", "verify", t.admin));
  assert.equal(
    t.item("kajabi_access").verified_by_membership_id,
    t.admin.membershipId,
  );
  assert.equal(
    t.item("kajabi_access").completed_by_membership_id,
    t.admin.membershipId,
  );
  assert.equal(
    one(t.raw, "SELECT status FROM onboarding_instances WHERE id=?", t.instance)
      .status,
    "complete",
  );
  assert.equal(
    one(
      t.raw,
      "SELECT relationship_status FROM bloomops_clients WHERE id='lawrence'",
    ).relationship_status,
    "active",
  );
  assert.equal(eventCount(t, "ONBOARDING_COMPLETED"), 1);
  assert.equal(eventCount(t, "CLIENT_ONBOARDING_COMPLETED"), 1);
  const completed = snapshot(t);
  saved(await t.mutate("kajabi_access", "verify", t.admin));
  assert.deepEqual(snapshot(t), completed);
  assert.deepEqual(all(t.raw, "SELECT * FROM service_engagements"), services);
});
test("unlinked, foreign, and another client cannot read or act by guessing ids; multi-client context stays separate", async () => {
  const t = await setup();
  const other = await t.person("other-client");
  assert.deepEqual(await portalOnboarding(t.db, other), []);
  t.extra("james_step", {
    clientId: "james",
    visibility: "client",
    party: "client",
  });
  t.extra("foreign_step", {
    clientId: "foreign",
    ws: t.otherWs,
    visibility: "client",
    party: "client",
  });
  for (const [clientId, itemId] of [
    ["james", "james_step"],
    ["foreign", "foreign_step"],
    ["lawrence", "james_step"],
    ["missing", t.item("agreement").id],
  ]) {
    assert.equal(
      (
        await mutateOnboardingItem(t.db, {
          actor: t.client,
          clientId,
          itemId,
          operation: "submit",
        })
      ).reason,
      "not_found",
    );
  }
  for (const id of ["james", "foreign", "missing"])
    assert.equal(
      await onboardingView(t.db, t.client, id, { portal: true }),
      null,
    );
  run(
    t.raw,
    "INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES(?,'james','Lawrence','lawrence-user')",
    t.ws,
  );
  const clients = await portalOnboarding(t.db, t.client);
  assert.deepEqual(
    clients.map((c) => c.id),
    ["james", "lawrence"],
  );
  assert.deepEqual(
    clients[0].onboarding.items.map((i) => i.id),
    ["james_step"],
  );
  assert.equal(clients[1].onboarding.items.length, 5);
});
for (const [name, options] of [
  ["internal", { visibility: "internal", party: "client" }],
  ["restricted", { visibility: "restricted", party: "client" }],
  ["team", { visibility: "client", party: "team" }],
  ["user", { visibility: "client", party: "user" }],
  ["external", { visibility: "client", party: "external" }],
])
  test(`Client cannot complete ${name} work`, async () => {
    const t = await setup();
    t.extra(name, options);
    const before = snapshot(t);
    const result = await t.mutate(name);
    assert.equal(result.ok, false);
    assert.deepEqual(snapshot(t), before);
  });
for (const role of ["team_member", "client"])
  test(`${role} cannot verify/manage through department, assignment, or owner designation`, async () => {
    const t = await setup();
    const actor = await t.person(`actor-${role}`, role);
    run(
      t.raw,
      "INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES(?,'lawrence',?)",
      t.ws,
      actor.membershipId,
    );
    run(
      t.raw,
      "UPDATE bloomops_clients SET owner_membership_id=? WHERE id='lawrence'",
      actor.membershipId,
    );
    run(
      t.raw,
      "INSERT INTO department_memberships(workspace_id,department_id,membership_id) SELECT ?,id,? FROM departments WHERE workspace_id=?",
      t.ws,
      actor.membershipId,
      t.ws,
    );
    saved(await t.mutate("kajabi_access"));
    const before = snapshot(t);
    for (const op of ["verify", "waive", "not_applicable", "complete"])
      assert.equal(
        (
          await t.mutate("kajabi_access", op, actor, {
            reason: "Valid rationale",
          })
        ).ok,
        false,
      );
    assert.deepEqual(snapshot(t), before);
  });
for (const role of ["owner", "admin", "project_manager"])
  test(`${role} may verify submitted visible work but cannot verify before submission`, async () => {
    const t = await setup();
    const actor =
      role === "owner"
        ? t.owner
        : role === "admin"
          ? t.admin
          : await t.person("pm", role);
    assert.equal(
      (await t.mutate("kajabi_access", "verify", actor)).reason,
      "invalid_state",
    );
    saved(await t.mutate("kajabi_access"));
    saved(await t.mutate("kajabi_access", "verify", actor));
  });
for (const party of ["team", "user", "external"])
  test(`coordinators complete ${party} work, including verification when configured`, async () => {
    const t = await setup();
    t.extra(party, { party, verify: true });
    saved(await t.mutate(party, "complete", t.admin));
    assert.equal(t.item(party).status, "completed");
    assert.ok(t.item(party).verified_at);
  });
for (const [operation, status, event] of [
  ["waive", "waived", "ONBOARDING_ITEM_WAIVED"],
  ["not_applicable", "not_applicable", "ONBOARDING_ITEM_NOT_APPLICABLE"],
])
  test(`${operation} requires durable rationale, satisfies required work, and refuses overwrite`, async () => {
    const t = await setup();
    for (const reason of [undefined, "", "  ", "x".repeat(1001)])
      assert.equal(
        (await t.mutate("agreement", operation, t.admin, { reason })).reason,
        "invalid_reason",
      );
    assert.equal(
      (
        await t.mutate("agreement", operation, t.client, {
          reason: "Client cannot waive",
        })
      ).ok,
      false,
    );
    saved(
      await t.mutate("agreement", operation, t.admin, {
        reason: "Already provided offline",
      }),
    );
    assert.equal(t.item("agreement").status, status);
    assert.equal(
      one(t.raw, "SELECT reason FROM onboarding_item_resolutions").reason,
      "Already provided offline",
    );
    assert.match(
      one(
        t.raw,
        "SELECT metadata_json FROM activity_events WHERE event_type=?",
        event,
      ).metadata_json,
      /Already provided offline/,
    );
    assert.equal(
      (await t.view()).items.find((i) => i.id === t.item("agreement").id).state,
      "no_action",
    );
    assert.doesNotMatch(
      JSON.stringify(await t.view()),
      /Already provided offline/,
    );
    const before = snapshot(t);
    saved(
      await t.mutate("agreement", operation, t.admin, {
        reason: "Already provided offline",
      }),
    );
    assert.deepEqual(snapshot(t), before);
    assert.equal(
      (await t.mutate("agreement", operation, t.admin, { reason: "Different" }))
        .reason,
      "invalid_state",
    );
    assert.equal(
      (
        await t.mutate(
          "agreement",
          operation === "waive" ? "not_applicable" : "waive",
          t.admin,
          { reason: "Different" },
        )
      ).reason,
      "invalid_state",
    );
    for (const item of ownRequired(t).filter(
      (i) => i.logical_key !== "agreement",
    ))
      saved(await t.mutate(item.logical_key));
    saved(await t.mutate("kajabi_access", "verify", t.admin));
    assert.equal((await t.view()).state, "complete");
    assert.throws(
      () =>
        run(t.raw, "UPDATE onboarding_item_resolutions SET reason='Rewrite'"),
      /immutable/,
    );
  });
for (const status of ["draft", "paused", "completed", "ended", "active"])
  test(`completion preserves unexpected client lifecycle ${status}`, async () => {
    const t = await setup();
    run(
      t.raw,
      "UPDATE bloomops_clients SET relationship_status=? WHERE id='lawrence'",
      status,
    );
    await doClientSteps(t);
    saved(await t.mutate("kajabi_access", "verify", t.admin));
    assert.equal((await t.view()).state, "complete");
    assert.equal(
      one(
        t.raw,
        "SELECT relationship_status FROM bloomops_clients WHERE id='lawrence'",
      ).relationship_status,
      status,
    );
    assert.equal(eventCount(t, "CLIENT_ONBOARDING_COMPLETED"), 0);
  });
for (const [key, op, who] of [
  ["agreement", "submit", "client"],
  ["kajabi_access", "submit", "client"],
  ["kajabi_access", "verify", "admin"],
])
  test(`concurrent ${op} ${key} converges with one semantic event`, async () => {
    const t = await setup();
    if (op === "verify") saved(await t.mutate(key));
    const results = await Promise.all([
      t.mutate(key, op, t[who]),
      t.mutate(key, op, t[who]),
    ]);
    results.forEach(saved);
    assert.equal(
      eventCount(
        t,
        op === "verify"
          ? "ONBOARDING_ITEM_VERIFIED"
          : key === "agreement"
            ? "ONBOARDING_ITEM_COMPLETED"
            : "ONBOARDING_ITEM_SUBMITTED",
      ),
      1,
    );
  });
test("two final item writes converge to one onboarding completion and Client Active event", async () => {
  const t = await setup();
  saved(await t.mutate("agreement"));
  saved(await t.mutate("kajabi_access"));
  saved(await t.mutate("kajabi_access", "verify", t.admin));
  (
    await Promise.all([t.mutate("brand_assets"), t.mutate("kickoff_booking")])
  ).forEach(saved);
  assert.equal(eventCount(t, "ONBOARDING_COMPLETED"), 1);
  assert.equal(eventCount(t, "CLIENT_ONBOARDING_COMPLETED"), 1);
});
test("submission racing verification is safe and retryable", async () => {
  const t = await setup();
  const [submit, verify] = await Promise.all([
    t.mutate("kajabi_access"),
    t.mutate("kajabi_access", "verify", t.admin),
  ]);
  saved(submit);
  assert.ok(verify.ok || verify.reason === "invalid_state");
  saved(await t.mutate("kajabi_access", "verify", t.admin));
  assert.equal(eventCount(t, "ONBOARDING_ITEM_SUBMITTED"), 1);
  assert.equal(eventCount(t, "ONBOARDING_ITEM_VERIFIED"), 1);
});
for (const failure of [
  "ONBOARDING_ITEM_SUBMITTED",
  "ONBOARDING_COMPLETED",
  "CLIENT_ONBOARDING_COMPLETED",
])
  test(`late ${failure} failure rolls back item, instance, client, facts and events`, async () => {
    const t = await setup();
    if (failure !== "ONBOARDING_ITEM_SUBMITTED") {
      await doClientSteps(t);
    }
    t.raw.exec(
      `CREATE TRIGGER forced_a10_failure BEFORE INSERT ON activity_events WHEN NEW.event_type='${failure}' BEGIN SELECT RAISE(ABORT,'forced late failure'); END`,
    );
    const before = snapshot(t);
    await assert.rejects(
      t.mutate(
        "kajabi_access",
        failure === "ONBOARDING_ITEM_SUBMITTED" ? "submit" : "verify",
        failure === "ONBOARDING_ITEM_SUBMITTED" ? t.client : t.admin,
      ),
    );
    assert.deepEqual(snapshot(t), before);
  });
test("scope and membership changes during preparation abort writes under the database lock", async () => {
  for (const change of ["suspend", "unlink"]) {
    const t = await setup();
    const batch = t.db.batch.bind(t.db);
    let first = true;
    t.db.batch = async (writes) => {
      if (first) {
        first = false;
        if (change === "suspend")
          run(
            t.raw,
            "UPDATE workspace_memberships SET status='suspended' WHERE id=?",
            t.client.membershipId,
          );
        else
          run(
            t.raw,
            "UPDATE client_contacts SET user_id=NULL WHERE id='lawrence-contact'",
          );
      }
      return batch(writes);
    };
    assert.equal((await t.mutate("agreement")).ok, false);
    assert.equal(t.item("agreement").status, "pending");
    assert.equal(eventCount(t, "ONBOARDING_ITEM_COMPLETED"), 0);
  }
});
test("same-workspace FKs and immutable facts hold for submissions and resolutions", async () => {
  const t = await setup();
  const other = await t.person("foreign-member", "admin", t.otherWs);
  const id = t.item("agreement").id;
  for (const table of [
    "onboarding_item_submissions",
    "onboarding_item_resolutions",
  ]) {
    const columns = table.endsWith("submissions")
      ? "submitted_by_membership_id,submitted_at"
      : "resolved_by_membership_id,resolved_at,reason";
    const values = table.endsWith("submissions") ? "?,?" : "?,?,?";
    const params = table.endsWith("submissions")
      ? [other.membershipId, "now"]
      : [other.membershipId, "now", "reason"];
    assert.throws(
      () =>
        run(
          t.raw,
          `INSERT INTO ${table}(onboarding_item_id,workspace_id,${columns}) VALUES(?,?,${values})`,
          id,
          t.ws,
          ...params,
        ),
      /FOREIGN KEY/,
    );
  }
  saved(await t.mutate("kajabi_access"));
  assert.throws(
    () => run(t.raw, "DELETE FROM onboarding_item_submissions"),
    /immutable/,
  );
});
test("HTTP reads and actions enforce real sessions, minimize payloads, and sanitize errors", async () => {
  const { GET: read } = await import(
    "../app/api/bloomops/portal/onboarding/route.js"
  );
  const { GET: clientRead } = await import(
    "../app/api/bloomops/portal/onboarding/[id]/route.js"
  );
  const { POST: submit } = await import(
    "../app/api/bloomops/portal/onboarding/[id]/items/[itemId]/submit/route.js"
  );
  const { POST: manage } = await import(
    "../app/api/bloomops/clients/[id]/onboarding/items/[itemId]/[operation]/route.js"
  );
  const t = await setup({ auth: true });
  t.extra("hidden_secret");
  const cookie = (await t.signIn("lawrence@example.com")).cookie,
    adminCookie = (await t.signIn("ary@example.com")).cookie;
  const call = (
    handler,
    {
      session = cookie,
      id = "lawrence",
      itemId = t.item("agreement").id,
      operation = "verify",
      method = "POST",
      origin = APP_URL,
      body = { status: "completed", workspaceId: t.otherWs },
    } = {},
  ) => {
    globalThis[Symbol.for("__cloudflare-context__")] = {
      env: t.env,
      cf: {},
      ctx: {},
    };
    return handler(
      new Request(`${APP_URL}/api/bloomops/portal/onboarding`, {
        method,
        headers: { cookie: session, origin },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      }),
      { params: Promise.resolve({ id, itemId, operation }) },
    );
  };
  assert.equal((await call(read, { method: "GET", session: "" })).status, 401);
  const data = await (await call(read, { method: "GET" })).json();
  assert.equal(data.clients[0].id, "lawrence");
  assert.doesNotMatch(
    JSON.stringify(data),
    /hidden_secret|MembershipId|template|logicalKey/,
  );
  assert.equal(
    (await call(submit, { origin: "https://evil.example" })).status,
    403,
  );
  for (const id of ["james", "foreign", "absent"])
    assert.equal((await call(clientRead, { method: "GET", id })).status, 404);
  assert.equal((await call(submit, { itemId: "hidden_secret" })).status, 404);
  assert.equal((await call(manage)).status, 404);
  assert.equal(
    (await call(submit, { itemId: t.item("kajabi_access").id })).status,
    200,
  );
  assert.equal(t.item("kajabi_access").status, "in_progress");
  assert.equal(
    (
      await call(manage, {
        session: adminCookie,
        itemId: t.item("kajabi_access").id,
      })
    ).status,
    200,
  );
  t.raw.exec(
    "CREATE TRIGGER fail_http BEFORE INSERT ON activity_events WHEN NEW.event_type='ONBOARDING_ITEM_COMPLETED' BEGIN SELECT RAISE(ABORT,'PRIVATE database detail'); END",
  );
  const failed = await call(submit);
  assert.equal(failed.status, 500);
  assert.doesNotMatch(await failed.text(), /PRIVATE|SQL|constraint/);
  assert.equal(t.item("agreement").status, "pending");
  run(
    t.raw,
    "UPDATE workspace_memberships SET status='suspended' WHERE id=?",
    t.client.membershipId,
  );
  assert.equal((await call(submit)).status, 403);
});
test("restricted item history and rationale do not escape through internal activity or manager read models", async () => {
  const { clientActivity } = await import(
    "../lib/bloomops/client-activity.mjs"
  );
  const t = await setup();
  const pm = await t.person("pm", "project_manager");
  t.extra("restricted_note", { visibility: "restricted" });
  assert.equal(
    (
      await t.mutate("restricted_note", "waive", pm, {
        reason: "Sensitive rationale",
      })
    ).reason,
    "not_found",
  );
  saved(
    await t.mutate("restricted_note", "waive", t.owner, {
      reason: "Sensitive rationale",
    }),
  );
  assert.doesNotMatch(
    JSON.stringify(await onboardingView(t.db, pm, "lawrence")),
    /restricted_note|Sensitive rationale/,
  );
  assert.doesNotMatch(
    JSON.stringify(await clientActivity(t.db, t.ws, "lawrence", { actor: pm })),
    /restricted_note|Sensitive rationale/,
  );
  assert.match(
    JSON.stringify(
      await clientActivity(t.db, t.ws, "lawrence", { actor: t.owner }),
    ),
    /Sensitive rationale/,
  );
});
test("portal render has no hidden instructions, internal rationale, identifiers, or inferred upload/link controls", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { AppRouterContext } = await import(
    "next/dist/shared/lib/app-router-context.shared-runtime.js"
  );
  const { PortalHome } = await import("../components/bloomops/PortalHome.jsx");
  const t = await setup();
  t.extra("hidden_detail");
  saved(
    await t.mutate("agreement", "waive", t.admin, {
      reason: "Internal rationale",
    }),
  );
  const clients = await portalOnboarding(t.db, t.client);
  const html = renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: { refresh() {} } },
      React.createElement(PortalHome, {
        workspaceName: "A10 Agency",
        user: { name: "Lawrence", email: "lawrence@example.com" },
        clients,
      }),
    ),
  );
  assert.match(html, /Hello, Lawrence|Your steps/);
  assert.match(html, /Optional/);
  assert.doesNotMatch(
    html,
    /hidden_detail|Internal rationale|templateVersion|logicalKey|MembershipId|type="file"|href=.*kajabi/,
  );
});
test("service-only team scope cannot acquire client onboarding access", async () => {
  const t = await setup();
  const actor = await t.person("contractor", "team_member");
  run(
    t.raw,
    "INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES(?,'kajabi',?)",
    t.ws,
    actor.membershipId,
  );
  assert.equal(await onboardingView(t.db, actor, "lawrence"), null);
  assert.equal(
    (await t.mutate("kajabi_access", "verify", actor)).reason,
    "not_found",
  );
});

test("In Progress without a durable submission is still actionable and cannot be verified", async () => {
  const t = await setup();
  run(
    t.raw,
    "UPDATE onboarding_items SET status='in_progress' WHERE id=?",
    t.item("kajabi_access").id,
  );
  const view = await t.view();
  const item = view.items.find((i) => i.id === t.item("kajabi_access").id);
  assert.equal(item.state, "todo");
  assert.equal(item.canAct, true);
  assert.equal(view.progress.done, 0);
  assert.equal(
    (await t.mutate("kajabi_access", "verify", t.admin)).reason,
    "invalid_state",
  );
  saved(await t.mutate("kajabi_access"));
  assert.equal(
    (await t.view()).items.find((i) => i.id === item.id).state,
    "awaiting_verification",
  );
});

test("instance identifiers cannot substitute for scoped client or item identifiers", async () => {
  const t = await setup();
  t.extra("other_item", {
    clientId: "james",
    visibility: "client",
    party: "client",
  });
  for (const instanceId of [t.instance, "other_item-instance"]) {
    assert.equal(
      await onboardingView(t.db, t.client, instanceId, { portal: true }),
      null,
    );
    assert.equal(
      (
        await mutateOnboardingItem(t.db, {
          actor: t.client,
          clientId: "lawrence",
          itemId: instanceId,
          operation: "submit",
        })
      ).reason,
      "not_found",
    );
  }
});
