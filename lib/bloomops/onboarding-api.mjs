import {
  requireAuthorized,
  requireAccess,
  getActor,
  json,
  forbidden,
  notFound,
} from "./access.mjs";
import {
  loadClientResource,
  loadInternalClientResource,
} from "./authorization.mjs";
import { onboardingView, portalOnboarding } from "./onboarding-views.mjs";
import { mutateOnboardingItem } from "./onboarding-runtime.mjs";

export async function portalOnboardingResponse(req) {
  const { access, response } = await requireAccess(req);
  if (response) return response;
  const actor = await getActor(access);
  if (actor.role !== "client") return forbidden();
  return json({ clients: await portalOnboarding(access.db, actor) });
}
export async function onboardingResponse(
  req,
  params,
  { portal = false, mutate = false } = {},
) {
  const { id, itemId, operation } = await params;
  const { access, response } = await requireAuthorized(req, {
    action: "onboarding.view",
    resource: (a) =>
      (portal ? loadClientResource : loadInternalClientResource)(
        a.db,
        a.workspace.id,
        id,
      ),
  });
  if (response) return response;
  if (portal && access.actor.role !== "client") return forbidden();
  if (!mutate) {
    const onboarding = await onboardingView(access.db, access.actor, id, {
      portal,
    });
    return onboarding ? json({ onboarding }) : notFound();
  }
  let body = {};
  if (!portal && ["waive", "not_applicable"].includes(operation)) {
    // Bounded before parsing; no other request fields become operational data.
    const raw = await req.text();
    if (raw.length > 8192)
      return json({ error: "Enter a reason of 1–1000 characters." }, 400);
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Enter a reason of 1–1000 characters." }, 400);
    }
  }
  try {
    const result = await mutateOnboardingItem(access.db, {
      actor: access.actor,
      clientId: id,
      itemId,
      operation: portal ? "submit" : operation === "submit" ? "" : operation,
      reason: body?.reason,
    });
    if (result.ok) return json(result);
    if (result.reason === "not_found") return notFound();
    if (result.reason === "forbidden") return forbidden();
    if (result.reason === "invalid_reason")
      return json({ error: "Enter a reason of 1–1000 characters." }, 400);
    return json(
      {
        error:
          "This step has changed or is not ready for that action. Refresh and try again.",
      },
      409,
    );
  } catch {
    return json(
      { error: "The step could not be saved. Please try again." },
      500,
    );
  }
}
