// Where a prospect came from.
//
// Report 5 could not answer a single acquisition question, because 4,787
// prospects have no reliable recorded origin. It could not even separate
// "coaches convert badly" from "one import batch was bad", since those were
// the same rows. That is twelve months of learning nobody can have.
//
// Three different things get called "source" in this codebase and they must
// stay apart:
//
//   evidence SOURCE   what a claim rests on          (lib/sources.mjs)
//   source_provider   how the record entered         (migration 043)
//   origin_class      where the business was found   (here)
//
// A prospect whose evidence is a MAP_LISTING did not necessarily come from a
// map. Inferring one from the other is exactly the shortcut that produced the
// unanswerable question in the first place, so this module refuses to do it.

export const ORIGIN = {
  MAP_LISTING: 'MAP_LISTING',
  SOCIAL_POST: 'SOCIAL_POST',
  DIRECTORY: 'DIRECTORY',
  MANUAL: 'MANUAL',
  REFERRAL: 'REFERRAL',
  REACTIVATION: 'REACTIVATION',
  OTHER: 'OTHER',
  // Legacy and recovered rows only. Never available to new intake, and never
  // written by an importer.
  UNKNOWN: 'UNKNOWN',
};

// What an importer may choose when it genuinely does not know. Choosing one of
// these is a decision the importer records, not a default the system applies on
// its behalf.
export const IMPORTER_FALLBACKS = [ORIGIN.MANUAL, ORIGIN.OTHER];

// The database insert order for origin provenance. Keeping this in the same
// module as resolveOrigin prevents routes from adding the columns but forgetting
// the matching bind values, which makes D1 reject the whole insert.
export const ORIGIN_FIELDS = Object.freeze([
  'origin_class',
  'origin_subtype',
  'origin_batch',
  'origin_query',
  'origin_at',
]);

export function originValues(origin = {}) {
  return ORIGIN_FIELDS.map((field) => origin[field] ?? null);
}

const NEW_INTAKE = new Set([
  ORIGIN.MAP_LISTING, ORIGIN.SOCIAL_POST, ORIGIN.DIRECTORY,
  ORIGIN.MANUAL, ORIGIN.REFERRAL, ORIGIN.REACTIVATION, ORIGIN.OTHER,
]);

export const isValidOrigin = (v) => NEW_INTAKE.has(String(v || '').trim().toUpperCase());

// Validate what an importer supplied.
//
// Returns the origin to store, or an error. It never guesses: an importer that
// cannot say where a row came from has to say MANUAL or OTHER out loud, and
// that admission is itself useful data.
// `defaultClass` exists for trusted machine callers that genuinely know their
// own origin, such as a reactivation job. It is NOT for user interfaces.
//
// An earlier version handed it to the Add Prospect route on the grounds that a
// person typing into a form is "manual". That confused the insertion path with
// the acquisition origin. Ary finding a studio on Facebook and typing it in is
// a SOCIAL_POST; recording MANUAL there would fill the acquisition data with a
// value that means "we did not ask", which is exactly the hole report 5 could
// not climb out of. The form asks instead.
export function resolveOrigin(input = {}, { defaultClass = null } = {}) {
  const cls = String(input.origin_class || input.originClass || '').trim().toUpperCase()
    || String(defaultClass || '').trim().toUpperCase();

  if (!cls) {
    return {
      ok: false,
      error: 'Every new prospect needs an origin. Pass origin_class, or MANUAL / OTHER if you genuinely do not know.',
    };
  }
  if (cls === ORIGIN.UNKNOWN) {
    return {
      ok: false,
      error: 'UNKNOWN is for legacy and recovered records. New intake has to name something, even if that is OTHER.',
    };
  }
  if (!isValidOrigin(cls)) {
    return { ok: false, error: `${cls} is not an origin class.` };
  }

  const str = (v) => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, 200) : null;
  };

  return {
    ok: true,
    origin: {
      origin_class: cls,
      origin_subtype: str(input.origin_subtype ?? input.originSubtype),
      // The import run. This is the field that makes a batch evaluable as a
      // cohort, which is the whole reason the coaching question stayed open.
      origin_batch: str(input.origin_batch ?? input.originBatch),
      origin_query: str(input.origin_query ?? input.originQuery),
      origin_at: str(input.origin_at ?? input.originAt) || new Date().toISOString().replace('T', ' ').slice(0, 19),
    },
  };
}

// What a legacy row has, and keeps.
//
// Deliberately not backfilled. Guessing origins for 4,787 rows would produce a
// dataset that looks answerable and is not, which is worse than one that admits
// it does not know.
export const legacyOrigin = () => ({
  origin_class: ORIGIN.UNKNOWN,
  origin_subtype: null,
  origin_batch: null,
  origin_query: null,
  origin_at: null,
});

export const originOf = (p = {}) => String(p.origin_class || '').trim() || ORIGIN.UNKNOWN;
export const hasRealOrigin = (p = {}) => isValidOrigin(originOf(p));

// Group prospects by their import run, for the cohort rollups that make
// acquisition answerable in about six months.
export function byBatch(prospects = []) {
  const out = new Map();
  for (const p of prospects) {
    const key = p.origin_batch || `${originOf(p)}:no-batch`;
    if (!out.has(key)) {
      out.set(key, { batch: p.origin_batch || null, originClass: originOf(p), n: 0, prospects: [] });
    }
    const row = out.get(key);
    row.n += 1;
    row.prospects.push(p.id);
  }
  return [...out.values()].sort((a, b) => b.n - a.n);
}
