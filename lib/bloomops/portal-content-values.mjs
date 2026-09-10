// Presentation only. Canonical stage and action eligibility remain in C1–C5.
export const PORTAL_CONTENT_PAGE_SIZE = 20;
export const PORTAL_CONTENT_VIEWS = { current: 'In progress & upcoming', action: 'Needs you', published: 'Recently published' };
export const PORTAL_CONTENT_STATUS = {
  idea: 'Planned', script: 'In progress', waiting_for_recording: 'In progress',
  editing: 'In progress', internal_review: 'In progress', client_review: 'In progress',
  revision_requested: 'In progress', approved: 'Ready', scheduled: 'Scheduled', published: 'Published',
};
export function portalContentFilters(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).some(key => !['view', 'page'].includes(key))
    || (query.view !== undefined && (typeof query.view !== 'string' || !Object.hasOwn(PORTAL_CONTENT_VIEWS, query.view)))
    || (query.page !== undefined && (typeof query.page !== 'string' || !/^[1-9]\d{0,5}$/.test(query.page)))) {
    return { ok: false, reason: 'invalid', errors: { form: 'Choose an available Content view and page.' } };
  }
  return { ok: true, view: query.view || 'current', page: Number(query.page || 1) };
}
