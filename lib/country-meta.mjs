// Country metadata for the workspace: which markets get emailed, and the
// timezone the automation should treat each one as living in. Extracted
// verbatim from ProspectsApp.jsx (split step 3).

// Countries you email, keyed by the short code stored in the DB. `tz` is a
// representative IANA timezone echoed on window.bloom so the follow-up
// automation can time sends (e.g. AU during their local midnight). US/CA
// span multiple zones — these are business-hours representatives, not exact.
export const COUNTRY_META = {
  US: { label: 'United States',  tz: 'America/New_York' },
  CA: { label: 'Canada',         tz: 'America/Toronto' },
  AU: { label: 'Australia',      tz: 'Australia/Sydney' },
  NZ: { label: 'New Zealand',    tz: 'Pacific/Auckland' },
  UK: { label: 'United Kingdom', tz: 'Europe/London' },
};

// Uppercase + the same aliases setCountry accepts. null/'' → no country.
export function normalizeCountry(value, countries) {
  if (value == null || value === '') return null;
  let c = String(value).trim().toUpperCase();
  if (c === 'GB') c = 'UK';
  if (c === 'CAD') c = 'CA';
  if (!countries.includes(c)) {
    throw new Error(`Invalid country: ${value}. Valid: ${countries.join(', ')}`);
  }
  return c;
}
