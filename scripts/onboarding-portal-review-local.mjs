#!/usr/bin/env node
// Built-Worker HTTP + browser Release A acceptance. Loopback and development
// R2 mail only. Run auth-smoke-local first to bootstrap the local workspace.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const base = arg("--url", "http://localhost:8787"),
  out = resolve(arg("--out", "/tmp/bloomops-a11-review"));
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const require = createRequire(
  join(
    resolve(arg("--playwright", "/tmp/bloomops-a9-browser")),
    "package.json",
  ),
);
const { chromium } = require("playwright");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
let checks = 0,
  screenshots = 0;
const widths = [1440, 1024, 768, 390, 320];
const check = (name, ok) => {
  assert.ok(ok, name);
  checks++;
  console.log(`ok   ${name}`);
};
const wrangler = (args, { retrySafe = false } = {}) => {
  const command = args[args.indexOf("--command") + 1] || "";
  const readOnly =
    args.includes("--command") && /^\s*(SELECT|PRAGMA)\b/i.test(command);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return execFileSync("npx", ["--no-install", "wrangler", ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      // A standalone local Wrangler connection can briefly collide with the
      // live Worker. Replay only reads or explicitly idempotent fixture writes;
      // application mutations and uncertain failures are never retried here.
      if (
        (!readOnly && !retrySafe) ||
        attempt === 2 ||
        !/SQLITE_BUSY|database is locked/.test(String(error.stderr))
      )
        throw error;
    }
  }
};
const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sql = (command, options) => {
  const text = wrangler([
    "d1",
    "execute",
    "DB",
    "--local",
    "--json",
    "--command",
    command,
  ], options);
  return JSON.parse(text.slice(text.indexOf("[")))[0].results;
};
const mail = (email) => {
  const key = createHash("sha256").update(email).digest("hex");
  const raw = wrangler([
    "r2",
    "object",
    "get",
    `bloomops-files-dev/dev-mail/${key}.json`,
    "--local",
    "--pipe",
  ]);
  return JSON.parse(raw.slice(raw.indexOf("{")));
};
const api = async (context, path, data, expected = 200) => {
  const response = await context.request.post(base + path, {
    headers: { origin: base },
    data,
  });
  assert.equal(response.status(), expected, await response.text());
  return response.json();
};
const login = async (email, next = "/") => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await api(context, "/api/auth/sign-in/magic-link", {
    email,
    callbackURL: next,
    newUserCallbackURL: next,
    errorCallbackURL: "/sign-in",
  });
  const url = mail(email).text.match(/https?:\/\/\S+/)[0];
  assert.ok(url.startsWith(base + "/api/auth/magic-link/verify?"));
  await page.goto(url);
  return { context, page };
};
const layout = async (label, page, width) => {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => document.fonts.ready);
  check(
    `${label} ${width}px fits the viewport`,
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  check(
    `${label} ${width}px heading and controls are readable`,
    (await page.locator("h1").count()) === 1 &&
      (await page.locator("button,input,textarea").evaluateAll((nodes) =>
        nodes
          .filter((n) => n.checkVisibility())
          .every((n) => {
            const r = n.getBoundingClientRect();
            return (
              r.width > 0 &&
              r.x >= 0 &&
              r.right <= innerWidth &&
              (innerWidth > 390 || r.height >= 44)
            );
          }),
      )),
  );
  await page.screenshot({
    path: join(out, `${label}-${width}.png`),
    fullPage: true,
  });
  screenshots++;
};
try {
  const reference = await browser.newPage();
  try {
    const response = await reference.goto(
      "https://bloomlab-preview.cool-sunset-2169.workers.dev/design",
      { timeout: 15000 },
    );
    if (response?.ok()) {
      await reference.getByRole("heading", { name: "Design gallery", exact: true }).waitFor({ timeout: 15000 });
      await reference.evaluate(() => document.fonts.ready);
      await reference.screenshot({
        path: join(out, "design-reference.png"),
        fullPage: true,
      });
      console.log("Design reference captured for visual inspection.");
    } else
      console.log(
        "Design reference unavailable; local design tokens and documented reference used.",
      );
  } catch {
    console.log(
      "Design reference unavailable; local design tokens and documented reference used.",
    );
  }
  await reference.close();
  const health = await (await fetch(base + "/api/health")).json();
  check(
    "development Worker uses local mail",
    health.environment === "development" &&
      health.auth.mail === "r2-dev" &&
      health.auth.configured,
  );
  const publicContext = await browser.newContext(),
    publicPage = await publicContext.newPage();
  await publicPage.goto(base + "/sign-in");
  for (const width of widths) await layout("sign-in", publicPage, width);
  const owner = await login("smoke-owner@example.com");
  const admin = await login("smoke-admin@example.com");
  check(
    "Ellen and Ary have live authenticated sessions",
    (await owner.context.request.get(base + "/api/bloomops/me")).ok() &&
      (await admin.context.request.get(base + "/api/bloomops/me")).ok(),
  );
  const suffix = randomUUID().slice(0, 8),
    email = `a11-lawrence-${suffix}@example.com`;
  const ws = sql("SELECT id FROM workspaces WHERE slug='smoke-agency'")[0].id;
  const made = await api(
    owner.context,
    "/api/bloomops/clients",
    { name: "Lawrence", contactName: "Lawrence", contactEmail: email },
    201,
  );
  const id = made.clientId || made.client.id;
  check("Ellen creates Lawrence", Boolean(id));
  const type = sql(
    `SELECT id FROM service_types WHERE workspace_id=${lit(ws)} AND slug='kajabi'`,
  )[0].id;
  await api(
    owner.context,
    `/api/bloomops/clients/${id}/services`,
    { serviceTypeId: type },
    201,
  );
  const ary = sql(
    `SELECT m.id FROM workspace_memberships m JOIN user u ON u.id=m.user_id WHERE m.workspace_id=${lit(ws)} AND u.email='smoke-admin@example.com'`,
  )[0].id;
  await api(
    owner.context,
    `/api/bloomops/clients/${id}/assignments`,
    { membershipId: ary },
    201,
  );
  check("Kajabi added and Ary assigned", true);
  const activation = await api(
    owner.context,
    `/api/bloomops/clients/${id}/activate`,
    {},
  );
  check(
    "A9 activation delivers local invitation",
    activation.deliveryStatus === "sent",
  );
  const token = mail(email).text.match(/\/invite\/([A-Za-z0-9_-]+)/)[1];
  await publicPage.goto(base + "/invite/" + token);
  check(
    "invitation explains joining and invited email sign-in",
    await publicPage
      .getByRole("button", { name: "Email me a link to accept" })
      .isVisible(),
  );
  const client = await login(email, "/invite/" + token);
  for (const width of widths)
    await layout("accept-invitation", client.page, width);
  await client.page
    .getByRole("button", { name: "Accept and continue" })
    .click();
  await client.page.waitForURL("**/portal");
  await api(client.context, "/api/bloomops/invitations/accept", { token });
  check(
    "acceptance retry after browser navigation stays singular",
    sql(
      `SELECT count(*) n FROM activity_events WHERE client_id=${lit(id)} AND event_type='INVITATION_ACCEPTED'`,
    )[0].n === 1,
  );
  await client.page.getByRole("heading", { name: "Hello, Lawrence" }).waitFor();
  check("Lawrence accepts and sees portal", true);
  for (const item of sql(`SELECT id,instructions FROM onboarding_items WHERE onboarding_instance_id IN (SELECT id FROM onboarding_instances WHERE client_id=${lit(id)})`)) {
    await api(owner.context, `/api/bloomops/clients/${id}/onboarding/items/${item.id}/configure`, { revision:0,actionType:'confirmation',actionUrl:null,instructions:item.instructions || 'Complete the agreed external work.' });
  }
  await client.page.reload();
  const read = async () =>
    (
      await (
        await client.context.request.get(
          base + "/api/bloomops/portal/onboarding",
        )
      ).json()
    ).clients.find((c) => c.id === id).onboarding;
  const initial = await read();
  check(
    "Common + Kajabi exposes four required steps and an optional step",
    initial.progress.total === 4 && initial.items.length === 5,
  );
  check(
    "portal response omits identity and provenance",
    !/MembershipId|logicalKey|templateVersion|workspaceId|resolutionReason/.test(
      JSON.stringify(initial),
    ),
  );
  const audit = async (label, page, width) => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    check(
      `${label} ${width}px has no horizontal overflow`,
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    check(
      `${label} ${width}px has one main heading`,
      (await page.locator("h1").count()) === 1,
    );
    check(
      `${label} ${width}px progress has accessible text`,
      (await page.locator("progress[aria-labelledby]").count()) === 1 &&
        (await page.locator("progress").evaluate((n) => {
          const text =
            document.getElementById(n.getAttribute("aria-labelledby"))
              ?.textContent || "";
          const m = text.match(/(\d+) of (\d+)/);
          const percent = [null, n.value];
          return (
            m &&
            percent &&
            Number(n.value) === Number(percent[1]) &&
            Number(n.max) === 100 &&
            Number(percent[1]) ===
              (Number(m[2])
                ? Math.round((Number(m[1]) / Number(m[2])) * 100)
                : 100)
          );
        })),
    );
    if (width <= 390)
      check(
        `${label} ${width}px controls have touch height`,
        await page
          .locator(".bo-onboarding button")
          .evaluateAll((nodes) =>
            nodes
              .filter((n) => n.checkVisibility())
              .every((n) => n.getBoundingClientRect().height >= 44),
          ),
      );
    screenshots++;
    await page.screenshot({
      path: join(out, `${label}-${width}.png`),
      fullPage: true,
    });
  };
  for (const width of widths) await audit("todo", client.page, width);
  const firstButton = client.page
    .getByRole("button", { name: "Confirm completed", exact: true })
    .first();
  await firstButton.focus();
  check(
    "completion control has visible keyboard focus",
    await firstButton.evaluate(
      (node) =>
        node === document.activeElement &&
        getComputedStyle(node).outlineStyle !== "none",
    ),
  );
  await client.page.keyboard.press("Enter");
  await client.page.getByText("1 of 4 required steps done").waitFor();
  check("keyboard action completes a Client step", true);
  await client.page
    .getByRole("button", { name: "Confirm completed", exact: true })
    .first()
    .dblclick();
  await client.page.getByText("2 of 4 required steps done").waitFor();
  check(
    "repeated browser click completes one additional step with one event",
    sql(
      `SELECT count(*) n FROM activity_events WHERE client_id=${lit(id)} AND event_type='ONBOARDING_ITEM_COMPLETED'`,
    )[0].n === 2,
  );
  for (const item of initial.items.filter((i) => i.required)) {
    await api(
      client.context,
      `/api/bloomops/portal/onboarding/${id}/items/${item.id}/submit`,
      { status: "completed", verifiedByMembershipId: ary, guidanceRevision: 1 },
    );
  }
  await client.page.reload();
  await client.page.getByText("You’re all set for now.").waitFor();
  check(
    "100% of Client steps persists after refresh while agency verification waits",
    (await read()).progress.percent === 100 && (await read()).state === "open",
  );
  for (const width of widths) await audit("waiting", client.page, width);
  const access = initial.items.find((i) => i.verificationRequired);
  check(
    "access remains in progress with no completion timestamp",
    sql(
      `SELECT status,completed_at FROM onboarding_items WHERE id=${lit(access.id)}`,
    )[0].status === "in_progress" &&
      sql(
        `SELECT completed_at FROM onboarding_items WHERE id=${lit(access.id)}`,
      )[0].completed_at === null,
  );
  await admin.page.goto(`${base}/clients/${id}?tab=onboarding`);
  await admin.page
    .getByRole("button", { name: "Verify step", exact: true })
    .waitFor();
  for (const width of widths) await audit("internal", admin.page, width);
  await admin.page
    .getByRole("button", { name: "Verify step", exact: true })
    .focus();
  check(
    "verification control is keyboard reachable",
    await admin.page
      .getByRole("button", { name: "Verify step", exact: true })
      .evaluate((n) => n === document.activeElement),
  );
  await admin.page.keyboard.press("Enter");
  await admin.page
    .getByText("Onboarding · Complete", { exact: true })
    .waitFor();
  check("Ary verifies in internal Client Onboarding tab", true);
  await client.page.reload();
  await client.page.getByText("Your onboarding is complete.").waitFor();
  for (const width of widths) await audit("complete", client.page, width);
  check(
    "Lawrence becomes Active",
    sql(
      `SELECT relationship_status FROM bloomops_clients WHERE id=${lit(id)}`,
    )[0].relationship_status === "active",
  );
  for (const event of ["ONBOARDING_COMPLETED", "CLIENT_ONBOARDING_COMPLETED"])
    check(
      `${event} recorded once`,
      sql(
        `SELECT count(*) AS n FROM activity_events WHERE client_id=${lit(id)} AND event_type=${lit(event)}`,
      )[0].n === 1,
    );
  await admin.page.goto(`${base}/clients/${id}?tab=activity`);
  check(
    "activity shows meaningful lifecycle facts",
    (await admin.page.locator("main").innerText()).includes(
      "Client became Active",
    ),
  );
  check(
    "service lifecycle remains Planned after onboarding completes",
    sql(
      `SELECT status FROM service_engagements WHERE client_id=${lit(id)}`,
    ).every((r) => r.status === "planned"),
  );
  for (const event of [
    "CLIENT_ACTIVATED",
    "CLIENT_INVITED",
    "ONBOARDING_STARTED",
    "INVITATION_ACCEPTED",
  ])
    check(
      `${event} is singular in Story 1`,
      sql(
        `SELECT count(*) n FROM activity_events WHERE client_id=${lit(id)} AND event_type=${lit(event)}`,
      )[0].n === 1,
    );
  const stranger = await api(
    owner.context,
    "/api/bloomops/clients",
    {
      name: "James",
      contactName: "James",
      contactEmail: `a11-james-${suffix}@example.com`,
    },
    201,
  );
  const james = stranger.clientId || stranger.client.id;
  for (const slug of ["social-media-management", "ads", "ghl"])
    await api(
      owner.context,
      `/api/bloomops/clients/${james}/services`,
      {
        serviceTypeId: sql(
          `SELECT id FROM service_types WHERE workspace_id=${lit(ws)} AND slug=${lit(slug)}`,
        )[0].id,
      },
      201,
    );
  const ja = await api(
    owner.context,
    `/api/bloomops/clients/${james}/activate`,
    {},
  );
  const meta = sql(
    `SELECT id FROM onboarding_items WHERE onboarding_instance_id=${lit(ja.instanceId)} AND logical_key='meta_business_access'`,
  );
  check(
    "Story 2 retains one merged Meta item for Social + Ads + GHL",
    meta.length === 1 &&
      sql(
        `SELECT count(*) AS n FROM onboarding_item_services WHERE onboarding_item_id=${lit(meta[0].id)}`,
      )[0].n === 2,
  );
  check(
    "Client cannot read another client by id",
    (
      await client.context.request.get(
        `${base}/api/bloomops/portal/onboarding/${james}`,
      )
    ).status() === 404,
  );
  check(
    "Client cannot mutate another client item",
    (
      await client.context.request.post(
        `${base}/api/bloomops/portal/onboarding/${james}/items/${meta[0].id}/submit`,
        { headers: { origin: base }, data: {} },
      )
    ).status() === 404,
  );
  const hidden = `a10_hidden_${suffix}`,
    instance = activation.instanceId;
  sql(
    `INSERT INTO onboarding_items(id,workspace_id,onboarding_instance_id,logical_key,title,instructions,visibility,responsible_party,required) VALUES(${lit(hidden)},${lit(ws)},${lit(instance)},${lit(hidden)},'Hidden QA detail','Hidden QA instructions','internal','team',0)`,
  );
  check(
    "hidden item absent from portal read and mutation",
    (await read()).items.every((i) => i.id !== hidden) &&
      (
        await client.context.request.post(
          `${base}/api/bloomops/portal/onboarding/${id}/items/${hidden}/submit`,
          { headers: { origin: base }, data: {} },
        )
      ).status() === 404,
  );
  await client.page.reload();
  check(
    "hidden work and unrelated client absent from rendered portal",
    !(await client.page.locator("main").innerText()).match(/Hidden QA|James/),
  );
  // Verify operational waiver/N/A controls against a local custom runtime
  // requirement, without changing any immutable master template definition.
  const internal = `a10_internal_${suffix}`;
  sql(
    `INSERT INTO onboarding_items(id,workspace_id,onboarding_instance_id,logical_key,title,visibility,responsible_party,required) VALUES(${lit(internal)},${lit(ws)},${lit(instance)},${lit(internal)},'Internal optional follow-up','internal','team',0)`,
  );
  await admin.page.goto(`${base}/clients/${id}?tab=onboarding`);
  const row = admin.page
    .locator("li.bo-onboarding-item")
    .filter({ hasText: "Internal optional follow-up" });
  await row.locator("summary").focus();
  await admin.page.keyboard.press("Enter");
  check(
    "resolution disclosure opens by keyboard",
    await row.getByLabel("Resolution reason", { exact: true }).isVisible(),
  );
  check(
    "opened resolution controls have mobile touch height",
    await row
      .locator("button")
      .evaluateAll((nodes) =>
        nodes.every((n) => n.getBoundingClientRect().height >= 44),
      ),
  );
  await row
    .getByLabel("Resolution reason", { exact: true })
    .fill("Covered in the kickoff call.\nApproved by Ellen.");
  await layout("multiline-resolution", admin.page, 320);
  await row.getByRole("button", { name: "Waive step", exact: true }).focus();
  await admin.page.keyboard.press("Enter");
  await row
    .getByText(
      "Resolution reason: Covered in the kickoff call. Approved by Ellen.",
    )
    .waitFor();
  check("internal waiver UI records and displays required reason", true);
  const hiddenRow = admin.page
    .locator("li.bo-onboarding-item")
    .filter({ hasText: "Hidden QA detail" });
  await hiddenRow.locator("summary").click();
  check(
    "opened N/A controls have mobile touch height",
    await hiddenRow
      .locator("button")
      .evaluateAll((nodes) =>
        nodes.every((n) => n.getBoundingClientRect().height >= 44),
      ),
  );
  await hiddenRow
    .getByLabel("Resolution reason", { exact: true })
    .fill("Not needed for this scope.");
  await hiddenRow
    .getByRole("button", { name: "Mark not applicable", exact: true })
    .click();
  await hiddenRow
    .getByText("Resolution reason: Not needed for this scope.")
    .waitFor();
  check("internal N/A UI records its own resolution", true);
  check(
    "completion event remains singular after optional resolutions",
    sql(
      `SELECT count(*) AS n FROM activity_events WHERE client_id=${lit(id)} AND event_type='ONBOARDING_COMPLETED'`,
    )[0].n === 1,
  );
  const jamesEmail = `a11-james-${suffix}@example.com`;
  const oldJamesToken = mail(jamesEmail).text.match(
    /\/invite\/([A-Za-z0-9_-]+)/,
  )[1];
  const jamesInvitation = sql(
    `SELECT invitation_id FROM client_activations WHERE client_id=${lit(james)}`,
  )[0].invitation_id;
  const core = () =>
    JSON.stringify(
      [
        "onboarding_items",
        "onboarding_instance_templates",
        "onboarding_item_services",
      ].map((table) => sql(`SELECT * FROM ${table} ORDER BY rowid`)),
    );
  const coreBefore = core();
  sql(
    `UPDATE workspace_invitations SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=${lit(jamesInvitation)}`,
  );
  await owner.page.goto(`${base}/clients/${james}`);
  await owner.page
    .getByText(
      "Client activated. The portal invitation has expired. Retry to send a new invitation.",
    )
    .waitFor();
  await layout("expired-invitation", owner.page, 320);
  await owner.page
    .getByRole("button", { name: "Retry invitation", exact: true })
    .click();
  await owner.page
    .getByText("Client activated. The portal invitation has been sent.")
    .waitFor();
  const jamesToken = mail(jamesEmail).text.match(
    /\/invite\/([A-Za-z0-9_-]+)/,
  )[1];
  check(
    "expired activation recovery rotates only the invitation",
    jamesToken !== oldJamesToken && core() === coreBefore,
  );
  await publicPage.goto(base + "/invite/" + oldJamesToken);
  check(
    "old expired invitation is unusable",
    await publicPage
      .getByRole("heading", { name: "Invitation not found" })
      .isVisible(),
  );
  const jamesSession = await login(jamesEmail, "/invite/" + jamesToken);
  await jamesSession.page
    .getByRole("button", { name: "Accept and continue" })
    .click();
  await jamesSession.page.waitForURL("**/portal");
  check(
    "James sees only James client-visible onboarding",
    (
      await (
        await jamesSession.context.request.get(
          base + "/api/bloomops/portal/onboarding",
        )
      ).json()
    ).clients.every((c) => c.id === james) &&
      !(await jamesSession.page.locator("main").innerText()).includes(
        "Lawrence",
      ),
  );
  for (const width of widths) await audit("james", jamesSession.page, width);
  const serviceId = (slug) =>
    sql(
      `SELECT se.id FROM service_engagements se JOIN service_types st ON st.id=se.service_type_id WHERE se.client_id=${lit(james)} AND st.slug=${lit(slug)}`,
    )[0].id;
  const social = serviceId("social-media-management"),
    ghl = serviceId("ghl");
  await api(
    owner.context,
    `/api/bloomops/clients/${james}/services/${ghl}/assignments`,
    { membershipId: ary },
    201,
  );
  check(
    "Ary has the canonical GHL assignment",
    sql(
      `SELECT count(*) n FROM service_assignments WHERE service_engagement_id=${lit(ghl)} AND membership_id=${lit(ary)}`,
    )[0].n === 1,
  );
  const contractorEmail = `a11-social-${suffix}@example.com`;
  await api(
    owner.context,
    "/api/bloomops/invitations",
    { email: contractorEmail, role: "team_member" },
    201,
  );
  const contractorToken = mail(contractorEmail).text.match(
    /\/invite\/([A-Za-z0-9_-]+)/,
  )[1];
  const contractor = await login(contractorEmail);
  await api(contractor.context, "/api/bloomops/invitations/accept", {
    token: contractorToken,
  });
  const contractorMember = sql(
    `SELECT m.id FROM workspace_memberships m JOIN user u ON u.id=m.user_id WHERE u.email=${lit(contractorEmail)} AND m.workspace_id=${lit(ws)}`,
  )[0].id;
  await api(
    owner.context,
    `/api/bloomops/clients/${james}/services/${social}/assignments`,
    { membershipId: contractorMember },
    201,
  );
  check(
    "Social contractor has only the Social assignment",
    sql(
      `SELECT service_engagement_id FROM service_assignments WHERE membership_id=${lit(contractorMember)}`,
    ).every((row) => row.service_engagement_id === social) &&
      sql(
        `SELECT count(*) n FROM client_assignments WHERE membership_id=${lit(contractorMember)}`,
      )[0].n === 0,
  );
  check(
    "assigned Social scope does not grant service management",
    (
      await contractor.context.request.patch(
        `${base}/api/bloomops/clients/${james}/services/${social}`,
        { headers: { origin: base }, data: { status: "active" } },
      )
    ).status() === 403,
  );
  for (const [path, method] of [
    [`clients/${james}`, "PATCH"],
    [`clients/${james}/services/${ghl}`, "PATCH"],
    [`clients/${james}/onboarding`, "GET"],
  ]) {
    const response = await contractor.context.request.fetch(
      `${base}/api/bloomops/${path}`,
      {
        method,
        headers: { origin: base },
        ...(method === "GET" ? {} : { data: {} }),
      },
    );
    check(
      `service scope refuses ${path.split("/").at(-1)}`,
      response.status() === 404,
    );
  }
  const deniedPage=await contractor.page.goto(`${base}/clients/${james}`);
  await contractor.page.getByRole('heading').first().waitFor();
  check('service-only contractor cannot render parent Client',deniedPage.status()===404 && !(await contractor.page.locator('body').innerText()).includes('James'));
  // Local operator publication uses a new immutable version, never edits an
  // existing definition. Canonical publication is also integration-tested.
  const master = sql(
    `SELECT v.* FROM template_versions v JOIN templates t ON t.id=v.template_id WHERE v.workspace_id=${lit(ws)} AND t.slug='social' AND v.status='published'`,
  )[0];
  const definition = JSON.parse(master.definition_json);
  // Bootstrap preserves published versions, including those from prior local
  // runs. A fresh marker proves this publication differs from the active one.
  const futureTitle = `Future social requirement ${suffix}`;
  definition.items[0].title = futureTitle;
  const { encodeOnboardingDefinition } = await import(
    "../lib/bloomops/onboarding-definition.mjs"
  );
  const encoded = await encodeOnboardingDefinition(definition),
    version = randomUUID();
  sql(
    `INSERT INTO template_versions(id,workspace_id,template_id,version_number,status,definition_json,definition_hash) SELECT ${lit(version)},${lit(ws)},${lit(master.template_id)},max(version_number)+1,'draft',${lit(encoded.definitionJson)},${lit(encoded.definitionHash)} FROM template_versions WHERE template_id=${lit(master.template_id)} ON CONFLICT(id) DO NOTHING`,
    { retrySafe: true },
  );
  check(
    "local publication fixture retains its exact new immutable definition",
    sql(`SELECT definition_hash FROM template_versions WHERE id=${lit(version)}`)[0]?.definition_hash === encoded.definitionHash,
  );
  sql(
    `UPDATE template_versions SET status='retired' WHERE id=${lit(master.id)}; UPDATE template_versions SET status='published',published_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=${lit(version)}`,
  );
  check(
    "publishing a later master preserves all generated items and provenance",
    core() === coreBefore,
  );
  await jamesSession.page.reload();
  check(
    "later master title never appears in James portal",
    !(await jamesSession.page.locator("main").innerText()).includes(
      futureTitle,
    ),
  );
  const bad = await owner.context.request.patch(
    `${base}/api/bloomops/clients/${james}`,
    {
      headers: { origin: base, "content-type": "application/json" },
      data: "{",
    },
  );
  check(
    "built Worker malformed JSON is a safe non-cached 400",
    bad.status() === 400 &&
      bad.headers()["cache-control"] === "no-store" &&
      !/SQL|constraint|stack/.test(await bad.text()),
  );
  const trigger = `a11_fail_${suffix.replaceAll("-", "")}`;
  try {
    sql(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON activity_events WHEN NEW.event_type='CLIENT_CREATED' AND NEW.client_id IN (SELECT id FROM bloomops_clients WHERE name='A11 forced failure ${suffix}') BEGIN SELECT RAISE(ABORT,'injected SQL constraint'); END`,
    );
    const failed = await owner.context.request.post(
      base + "/api/bloomops/clients",
      {
        headers: { origin: base },
        data: {
          name: `A11 forced failure ${suffix}`,
          contactName: "Failure fixture",
          contactEmail: `a11-failure-${suffix}@example.com`,
        },
      },
    );
    check(
      "built Worker late constraint returns sanitized JSON 500",
      failed.status() === 500 &&
        failed.headers()["content-type"].includes("application/json") &&
        !/SQL|constraint|stack|a11_fail/.test(await failed.text()),
    );
    check(
      "built Worker failed creation leaves no orphan client",
      sql(
        `SELECT count(*) n FROM bloomops_clients WHERE name='A11 forced failure ${suffix}'`,
      )[0].n === 0,
    );
  } finally {
    sql(`DROP TRIGGER IF EXISTS ${trigger}`);
  }
  const jamesMember = sql(
    `SELECT m.id FROM workspace_memberships m JOIN user u ON u.id=m.user_id WHERE u.email=${lit(jamesEmail)} AND m.workspace_id=${lit(ws)}`,
  )[0].id;
  try {
    sql(
      `UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(jamesMember)}`,
    );
    check(
      "issued James session is refused immediately after suspension",
      (
        await jamesSession.context.request.get(
          base + "/api/bloomops/portal/onboarding",
        )
      ).status() === 403,
    );
  } finally {
    sql(
      `UPDATE workspace_memberships SET status='active' WHERE id=${lit(jamesMember)}`,
    );
  }
  // Existing multi-client scope is exercised by explicit local contact linkage;
  // A11 does not add a second-client invitation workflow.
  const second = await api(
      owner.context,
      "/api/bloomops/clients",
      {
        name: "Lawrence Studio",
        contactName: "Studio contact",
        contactEmail: `a11-studio-${suffix}@example.com`,
      },
      201,
    ),
    secondId = second.clientId || second.client.id;
  const clientUser = sql(`SELECT id FROM user WHERE email=${lit(email)}`)[0].id;
  sql(
    `INSERT INTO client_contacts(id,workspace_id,client_id,name,user_id) VALUES(${lit(randomUUID())},${lit(ws)},${lit(secondId)},'Lawrence',${lit(clientUser)})`,
  );
  await client.page.reload();
  check(
    "multi-client portal labels each account separately",
    (await client.page
      .getByRole("heading", { name: "Lawrence · Onboarding", exact: true })
      .isVisible()) &&
      (await client.page
        .getByRole("heading", {
          name: "Lawrence Studio · Onboarding",
          exact: true,
        })
        .isVisible()) &&
      (await client.page.locator("main").innerText()).includes(
        "across 2 accounts",
      ),
  );
  for (const width of widths) await layout("multi-client", client.page, width);
  console.log(
    `Release A Worker HTTP/browser acceptance: ${checks} checks passed; ${screenshots} screenshots in ${out}`,
  );
} finally {
  await browser.close();
}
