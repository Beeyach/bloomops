// In-flight audit video renders, kept in localStorage.
//
// A render takes two to four minutes and nothing in the browser is waiting on
// it: the service uploads the finished file to a URL derived from the domain,
// so the only question is when that URL starts answering. Holding that question
// in the drawer's own state meant closing the drawer forgot it, and reloading
// the page forgot it twice.
//
// Here instead, so a render survives closing the drawer, switching views, and
// reloading. The watcher polls whatever is in here and says when one lands.

const KEY = 'leadsthatbloom:renders:v1';
const EVENT = 'ltb:renders';

// A render that has not landed in twenty minutes is not going to. Keeping it
// would poll a dead URL forever and, worse, leave a card on screen claiming
// work is still happening.
// Cloud Run kills the request itself at 600 seconds, so no render can honestly
// run longer than ten minutes: waiting twenty was waiting twice the longest
// possible answer. Twelve leaves room for the upload and a poll or two after
// the service is done, and still gives up eight minutes sooner than before.
//
// This is the backstop, not the main path. A render that actually fails — a
// site that will not load gives up at its 45 second navigation timeout — is
// now written onto the prospect as BLOCKED with the reason, so it surfaces in
// about a minute rather than being waited out. This only catches a render that
// vanishes without answering at all.
//
// Not shortened for a warm audio cache. The cache removes the voice generation,
// but the browser walkthrough is recorded in real time and is most of the
// clock, so the ceiling barely moves.
const GIVE_UP_MS = 12 * 60 * 1000;

// One render at a time, on purpose.
//
// Two at once fell over each other in two different ways. They share one audio
// cache mounted from a bucket, and the standard voice lines are the same file
// for every prospect, so two renders reaching for the same clip at the same
// moment caught each other mid-write: gcsfuse answers that with a stale file
// handle and the whole render died at ffprobe. And two renders plus a cold
// start pushed past Cloud Run's three-instance cap, so the overflow came back
// as "no available instance" (429/500/504) and sat in the browser as a render
// that never landed.
//
// Serial sidesteps both. The first render warms the cache with every shared
// line; each one after it reads a warm cache and writes nothing, so nothing
// collides and only one instance is ever busy. A batch is slower this way, but
// slower and finishing beats faster and failing.
export const MAX_CONCURRENT = 1;

function read() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function write(list) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Private mode, or a full quota. The render still runs; we just cannot
    // remember it, which is the old behaviour rather than a new failure.
  }
  // localStorage's own storage event only fires in OTHER tabs, so this is what
  // updates the tab that made the change.
  window.dispatchEvent(new CustomEvent(EVENT));
}

// Anything past the deadline is given up on when the queue is read, so nothing
// else has to think about expiry.
//
// A queued render has no startedAt yet, so only running ones can time out.
// Dropping a pending entry because it had been waiting twenty minutes was the
// obvious bug to write here, and it would silently shorten a long batch.
//
// Marked failed rather than deleted. Deleting it was worse than useless: the
// row simply disappeared, which reads as nothing having happened rather than as
// a render that was abandoned, and the slot freed without anybody being told
// why. It also left the video unrecorded with no sign it had ever been tried.
// Failed keeps it on screen with its reason, and queueRenders will take it
// again because a failed entry is the one thing it does not treat as a
// duplicate.
export function listRenders() {
  const now = Date.now();
  const all = read();
  let changed = false;
  const live = all.map((r) => {
    if (r.state !== 'running') return r;
    if (now - (r.startedAt || 0) < GIVE_UP_MS) return r;
    changed = true;
    return { ...r, state: 'failed', error: `Gave up after ${Math.round(GIVE_UP_MS / 60000)} minutes` };
  });
  if (changed) write(live);
  return live;
}

export function addRender(entry) {
  const list = listRenders().filter((r) => r.id !== entry.id);
  write([...list, { ...entry, state: 'running', startedAt: Date.now() }]);
}

// Adds without starting. The watcher promotes them as slots free up.
//
// A prospect already queued or recording is left alone, because asking twice
// should not record twice. One that FAILED is different: the answer to "record
// this again" is yes, and it was being read as a duplicate and dropped without
// a word. Maureen's render died when the service restarted underneath it, her
// entry stayed in the list as failed, and every attempt to queue her again did
// nothing at all until the entry aged out twelve minutes later.
//
// The failed entry is replaced rather than added beside, so the queue never
// holds two rows for the same prospect.
export function queueRenders(entries) {
  const list = listRenders();
  const blocking = new Set(list.filter((r) => r.state !== 'failed').map((r) => r.id));
  const fresh = entries.filter((e) => !blocking.has(e.id)).map((e) => ({ ...e, state: 'pending' }));
  if (!fresh.length) return 0;
  const retrying = new Set(fresh.map((e) => e.id));
  write([...list.filter((r) => !retrying.has(r.id)), ...fresh]);
  return fresh.length;
}

// baselineEtag is what was already at the video's address when this render
// started, so a re-record can be told from the recording it is replacing. Left
// alone when not passed, so callers that have nothing to say about it (a first
// render) do not blank one that was already recorded.
export function markRunning(id, baselineEtag) {
  write(
    listRenders().map((r) =>
      r.id === id
        ? {
            ...r,
            state: 'running',
            startedAt: Date.now(),
            ...(baselineEtag !== undefined ? { baselineEtag } : {}),
          }
        : r
    )
  );
}

export function markFailed(id, error) {
  write(listRenders().map((r) => (r.id === id ? { ...r, state: 'failed', error } : r)));
}

// Back to the end of the line, with no startedAt, so the watcher picks it up
// again when a slot frees.
//
// For refusals that say "not now" rather than "not ever": the service holds two
// renders and answers a third with "busy, try again in a few minutes". That is
// not a failure of the prospect or of their site, and marking it failed put a
// red line through a video that had not been attempted. With a queue of a
// hundred and forty it happens constantly, because every one of them is a third
// request at some point.
export function markPending(id) {
  write(
    listRenders().map((r) => {
      if (r.id !== id) return r;
      const { startedAt, error, ...rest } = r;
      return { ...rest, state: 'pending' };
    })
  );
}

export function clearQueue() {
  write([]);
}

export function removeRender(id) {
  write(listRenders().filter((r) => r.id !== id));
}

export function getRender(id) {
  return listRenders().find((r) => r.id === id) || null;
}

export function isRendering(id) {
  return !!getRender(id);
}

// Fires for changes made in this tab and in any other tab with the app open.
export function onRendersChanged(fn) {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e) => {
    if (!e.key || e.key === KEY) fn();
  };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', onStorage);
  };
}
