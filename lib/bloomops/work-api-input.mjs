import { json } from './access.mjs';

// Validate only after identity/scope authorization, preserving indistinguishable
// denials for inaccessible records. Work resource routes have no query inputs;
// collection routes explicitly name their supported filters.
export async function workQueryAccess(req, authorization, allowed = []) {
  const result = await authorization;
  if (result.response) return result;
  const query = new URL(req.url).searchParams;
  return [...query.keys()].some(key => !allowed.includes(key) || query.getAll(key).length !== 1)
    ? { response: json({ error: 'Choose only the available filters, with one value each.' }, 400) }
    : result;
}
