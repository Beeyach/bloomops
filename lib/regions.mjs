// Where a prospect is, as a scope rather than a filter.
//
// AU and US run on different clocks and get worked on different days, so
// "who is due" is nearly always asked about one of them and not both.
// Moved out of ProspectsApp.jsx verbatim so the journey view and the classic
// view scope the world with the same list.

export const REGIONS = [
  { id: '', label: 'Everywhere' },
  { id: 'au', label: 'AU + NZ', match: ['AU', 'NZ', 'AUS', 'AUSTRALIA', 'NEW ZEALAND'] },
  { id: 'us', label: 'US + CA', match: ['US', 'USA', 'CA', 'CAN', 'UNITED STATES', 'CANADA'] },
  { id: 'uk', label: 'UK + EU', match: ['GB', 'UK', 'IE', 'DE', 'FR', 'NL', 'ES', 'IT'] },
  { id: 'none', label: 'No country', match: null },
];

// A prospect with no country is only ever in the "No country" scope, never
// silently swept into a region it was never assigned to.
export function inRegion(p, regionId) {
  if (!regionId) return true;
  const c = String(p?.country || '').trim().toUpperCase();
  if (regionId === 'none') return !c;
  const r = REGIONS.find((x) => x.id === regionId);
  return Boolean(r?.match && c && r.match.includes(c));
}

// The journey view's region choice is persistent on purpose — which half of
// the world you are working is a standing fact, unlike which tab you opened.
export const JOURNEY_REGION_KEY = 'ltb_journey_region_v1';
