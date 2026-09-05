// Is what we know about replies still trustworthy?
//
// The follow-up guard is deterministic and correct, and it is only ever as good
// as the reply data underneath it. If Gmail sync has been broken for three days
// then `canProgressOutbound` is answering from a mailbox nobody has read, and
// it will happily clear a prospect who wrote back on Tuesday.
//
// So a broken mailbox stops the preparation of new follow-ups. That is what
// failing closed means here: not "stop everything", but "stop the one thing
// whose safety depends on the part that is broken".
//
// The distinction that matters: a workspace with NO mailbox connected is not
// broken. It never used Gmail sync, its reply data comes from wherever it
// always did, and blocking it would be punishing it for a feature it does not
// have. Only a mailbox that was connected and has stopped working counts.

export const MAILBOX = {
  NONE: 'none',              // never connected: not a failure
  HEALTHY: 'healthy',
  STALE: 'stale',            // connected, but nobody has read it in too long
  BROKEN: 'broken',          // needs reconnecting, or erroring
};

// How long a connected mailbox may go unread before its reply data is treated
// as untrustworthy. Generous next to the five-minute reconcile: this should
// only fire when something is genuinely wrong, not when one cron run was slow.
export const STALE_AFTER_MINUTES = 90;

export function mailboxHealth(accounts = [], { now = new Date() } = {}) {
  if (!accounts.length) {
    return { state: MAILBOX.NONE, safeToPrepare: true, reason: null };
  }

  const broken = accounts.find((a) => a.status && a.status !== 'connected');
  if (broken) {
    return {
      state: MAILBOX.BROKEN,
      safeToPrepare: false,
      mailbox: broken.email_address,
      reason: `Gmail sync is not working (${broken.status}), so a reply could have arrived without the app seeing it.`,
    };
  }

  const cutoff = new Date(now.getTime() - STALE_AFTER_MINUTES * 60_000).toISOString();
  const stale = accounts.find((a) => !a.last_sync_at || a.last_sync_at < cutoff);
  if (stale) {
    return {
      state: MAILBOX.STALE,
      safeToPrepare: false,
      mailbox: stale.email_address,
      reason: stale.last_sync_at
        ? `Gmail has not been read since ${stale.last_sync_at}, so a reply could have arrived without the app seeing it.`
        : 'Gmail has not been read yet, so a reply could have arrived without the app seeing it.',
    };
  }

  return { state: MAILBOX.HEALTHY, safeToPrepare: true, reason: null };
}
