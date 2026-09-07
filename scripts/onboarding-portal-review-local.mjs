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
  out = resolve(arg("--out", "/tmp/bloomops-a10-review"));
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
let checks = 0;
const check = (name, ok) => {
  assert.ok(ok, name);
  checks++;
  console.log(`ok   ${name}`);
};
const wrangler = (args) =>
  execFileSync("npx", ["--no-install", "wrangler", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sql = (command) => {
  const text = wrangler([
    "d1",
    "execute",
    "DB",
    "--local",
    "--json",
    "--command",
    command,
  ]);
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
try {
  const health = await (await fetch(base + "/api/health")).json();
  check(
    "development Worker uses local mail",
    health.environment === "development" &&
      health.auth.mail === "r2-dev" &&
      health.auth.configured,
  );
  const owner = await login("smoke-owner@example.com");
  const admin = await login("smoke-admin@example.com");
  check(
    "Ellen and Ary have live authenticated sessions",
    (await owner.context.request.get(base + "/api/bloomops/me")).ok() &&
      (await admin.context.request.get(base + "/api/bloomops/me")).ok(),
  );
  const suffix = randomUUID().slice(0, 8),
    email = `a10-lawrence-${suffix}@example.com`;
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
  const client = await login(email, "/portal");
  await api(client.context, "/api/bloomops/invitations/accept", { token });
  await client.page.goto(base + "/portal");
  await client.page.getByRole("heading", { name: "Hello, Lawrence" }).waitFor();
  check("Lawrence accepts and sees portal", true);
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
      (await page.locator("progress[aria-labelledby]").count()) === 1,
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
    await page.screenshot({
      path: join(out, `${label}-${width}.png`),
      fullPage: true,
    });
  };
  for (const width of [1440, 1024, 768, 390, 320])
    await audit("todo", client.page, width);
  const firstButton = client.page
    .getByRole("button", { name: "I’ve done this", exact: true })
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
  for (const item of initial.items.filter((i) => i.required)) {
    await api(
      client.context,
      `/api/bloomops/portal/onboarding/${id}/items/${item.id}/submit`,
      { status: "completed", verifiedByMembershipId: ary },
    );
  }
  await client.page.reload();
  await client.page.getByText("You’re all set for now.").waitFor();
  check(
    "100% of Client steps persists after refresh while agency verification waits",
    (await read()).progress.percent === 100 && (await read()).state === "open",
  );
  for (const width of [1440, 1024, 768, 390, 320])
    await audit("waiting", client.page, width);
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
  for (const width of [1440, 1024, 768, 390, 320])
    await audit("internal", admin.page, width);
  await admin.page
    .getByRole("button", { name: "Verify step", exact: true })
    .click();
  await admin.page
    .getByText("Onboarding · Complete", { exact: true })
    .waitFor();
  check("Ary verifies in internal Client Onboarding tab", true);
  await client.page.reload();
  await client.page.getByText("Your onboarding is complete.").waitFor();
  for (const width of [1440, 1024, 768, 390, 320])
    await audit("complete", client.page, width);
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
  const stranger = await api(
    owner.context,
    "/api/bloomops/clients",
    {
      name: "James",
      contactName: "James",
      contactEmail: `a10-james-${suffix}@example.com`,
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
  await row.locator("summary").click();
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
    .fill("Covered in the kickoff call.");
  await row.getByRole("button", { name: "Waive step", exact: true }).click();
  await row
    .getByText("Resolution reason: Covered in the kickoff call.")
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
  console.log(
    `A10 Worker HTTP/browser/Release A acceptance: ${checks} checks passed; 20 screenshots in ${out}`,
  );
} finally {
  await browser.close();
}
