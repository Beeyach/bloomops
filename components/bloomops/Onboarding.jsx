"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from './Icons';
import OnboardingGuidance from './OnboardingGuidance';
import { ONBOARDING_ACTIONS } from '@/lib/bloomops/onboarding-guidance-values.mjs';
import { Button, Field, Notice, Status } from "./Primitives";

const clientStates = {
  todo: "To do",
  awaiting_verification: "Awaiting verification",
  complete: "Complete",
  no_action: "No action needed",
  agency: "We’re handling this",
};
const states = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
  waived: "Waived",
  not_applicable: "Not applicable",
};
const parties = {
  client: "Client",
  team: "Team",
  user: "Specific user",
  external: "External",
};
const instanceStates = {
  not_started: "Not started",
  in_progress: "In progress",
  ready: "Ready",
  blocked: "Blocked",
  complete: "Complete",
};

export default function Onboarding({ clientId, onboarding, portal = false }) {
  if (!onboarding || onboarding.state === "not_created")
    return (
      <p className="bo-body">
        {portal
          ? "Your onboarding steps will appear here when the agency is ready."
          : "Requirements are generated when the client is activated."}
      </p>
    );
  return (
    <OnboardingProgress
      clientId={clientId}
      onboarding={onboarding}
      portal={portal}
    />
  );
}
function OnboardingProgress({ clientId, onboarding, portal }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [refreshing, startTransition] = useTransition();
  const [feedback, setFeedback] = useState(null);
  const [reasons, setReasons] = useState({});
  const { progress, items } = onboarding;
  const [showCompleted, setShowCompleted] = useState(false);
  const closed = item => ['complete', 'no_action'].includes(item.state);
  const completedCount = items.filter(closed).length;
  const shownItems = portal && !showCompleted ? items.filter(item => !closed(item)) : items;
  const doneForNow = progress.done === progress.total;
  async function act(item, operation) {
    if (busy || refreshing) return;
    setBusy(item.id);
    setFeedback(null);
    try {
      const base = portal
        ? `/api/bloomops/portal/onboarding/${encodeURIComponent(clientId)}`
        : `/api/bloomops/clients/${encodeURIComponent(clientId)}/onboarding`;
      const response = await fetch(
        `${base}/items/${encodeURIComponent(item.id)}/${operation}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(portal ? { guidanceRevision: item.guidanceRevision } : { reason: reasons[item.id] || "" }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "The step could not be saved. Please try again.",
        );
      setFeedback({
        message:
          portal && item.verificationRequired
            ? "Thank you. We’ll check this step and confirm it for you."
            : "Step saved.",
      });
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback({ error: true, message: error.message });
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="bo-onboarding">
      <div className="bo-onboarding-progress">
        {!portal && <p className="bo-body bo-strong">Onboarding · {instanceStates[onboarding.state] || "In progress"}</p>}
        <p className="bo-small" id={`progress-${clientId}`}>
          {progress.done} of {progress.total}{" "}
          {portal ? "required steps done" : "visible required steps satisfied"}{" "}
          {!portal && <> · {progress.percent}%</>}
        </p>
        <progress
          max="100"
          value={progress.percent}
          aria-labelledby={`progress-${clientId}`}
        />
      </div>
      {onboarding.state === "complete" ? (
        <Notice tone="success">
          Your onboarding is complete. Thank you for getting everything ready.
        </Notice>
      ) : portal && doneForNow ? (
        <Notice>
          You’re all set for now. We’re checking the remaining steps.
        </Notice>
      ) : null}
      {portal && items.some(item => item.canAct) && <p className="bo-hint">Use the instructions and links below. Confirm each step only after finishing the work.</p>}
      <div aria-live="polite" aria-atomic="true">
        {feedback && (
          <Notice tone={feedback.error ? "error" : "success"}>
            {feedback.message}
          </Notice>
        )}
      </div>
      {portal && completedCount > 0 && <Button icon={showCompleted ? 'chevron-down' : 'chevron-right'} aria-expanded={showCompleted} onClick={() => setShowCompleted(!showCompleted)}>
        {showCompleted ? 'Hide completed' : 'Show completed'} ({completedCount})
      </Button>}
      <ol
        className="bo-onboarding-items"
        aria-label={
          portal ? "Your onboarding steps" : "Onboarding requirements"
        }
      >
        {shownItems.map((item) => (
          <li
            key={item.id}
            className="bo-onboarding-item"
            aria-labelledby={`step-${item.id}`}
          >
            <div className="bo-onboarding-item-head">
              <div className="bo-onboarding-step-title">
                <Icon name={closed(item) ? 'check' : ONBOARDING_ACTIONS[item.actionType]?.icon || 'onboarding'} size={22} />
                <div><h3 className="bo-h3" id={`step-${item.id}`}>
                  {item.title}
                </h3>
                <p className="bo-small">
                  {!item.required ? "Optional" : !portal ? "Required" : null}
                </p></div>
              </div>
              <Status
                label={
                  portal
                    ? item.state === "todo" && !item.guidanceReady ? "Waiting on your team" : clientStates[item.state]
                    : item.submittedAt && item.status === "in_progress"
                      ? "Awaiting verification"
                      : states[item.status]
                }
                tone={
                  item.state === "complete" || item.status === "completed"
                    ? "success"
                    : "neutral"
                }
              />
            </div>
            {item.instructions && (!portal || item.guidanceReady || closed(item)) && (
              <p className="bo-body bo-onboarding-instructions">
                {item.instructions}
              </p>
            )}
            {portal && item.state === 'todo' && !item.guidanceReady && <p className="bo-hint">Your team is preparing the instructions and destination for this step.</p>}
            {!portal && (
              <p className="bo-small">
                {parties[item.responsibleParty]} ·{" "}
                {item.visibility === "client"
                  ? "Client-visible"
                  : item.visibility === "restricted"
                    ? "Restricted"
                    : "Internal"}
                {item.verificationRequired ? " · Verification required" : ""}
              </p>
            )}
            {!portal && item.resolutionReason && (
              <p className="bo-body">
                Resolution reason: {item.resolutionReason}
              </p>
            )}
            <div className="bo-onboarding-controls">
              {item.guidanceReady && item.actionUrl && <Button href={item.actionUrl} icon="external-link" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{ONBOARDING_ACTIONS[item.actionType]?.label} <span className="sr-only">(opens in a new tab)</span></Button>}
              {!portal && item.actions.configure && <OnboardingGuidance item={item} clientId={clientId} disabled={Boolean(busy) || refreshing} onSaved={() => startTransition(() => router.refresh())} />}

              {portal && item.canAct && (
                <Button
                  icon="check"
                  onClick={() => act(item, "submit")}
                  disabled={Boolean(busy) || refreshing}
                  loading={busy === item.id}
                >
                  {item.verificationRequired
                    ? "Submit for verification"
                    : "Confirm completed"}
                </Button>
              )}
              {!portal && item.actions.verify && (
                <Button
                  onClick={() => act(item, "verify")}
                  disabled={Boolean(busy) || refreshing}
                  loading={busy === item.id}
                >
                  Verify step
                </Button>
              )}
              {!portal && item.actions.complete && (
                <Button
                  onClick={() => act(item, "complete")}
                  disabled={Boolean(busy) || refreshing}
                  loading={busy === item.id}
                >
                  Complete step
                </Button>
              )}
            </div>
            {!portal && item.actions.resolve && (
              <details className="bo-onboarding-resolution">
                <summary>Resolve as waived or not applicable</summary>
                <Field
                  id={`reason-${item.id}`}
                  label="Resolution reason"
                  hint="Required. Visible only to authorized internal users; retained in activity history."
                >
                  <textarea
                    id={`reason-${item.id}`}
                    className="bo-input"
                    maxLength={1000}
                    value={reasons[item.id] || ""}
                    onChange={(e) =>
                      setReasons({ ...reasons, [item.id]: e.target.value })
                    }
                    aria-describedby={`reason-${item.id}-hint`}
                  />
                </Field>
                <div className="bo-onboarding-controls">
                  <Button
                    disabled={
                      Boolean(busy) || refreshing || !reasons[item.id]?.trim()
                    }
                    onClick={() => act(item, "waive")}
                  >
                    Waive step
                  </Button>
                  <Button
                    disabled={
                      Boolean(busy) || refreshing || !reasons[item.id]?.trim()
                    }
                    onClick={() => act(item, "not_applicable")}
                  >
                    Mark not applicable
                  </Button>
                </div>
              </details>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
