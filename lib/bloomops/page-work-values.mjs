import {ACTION_STATUSES} from './action-values.mjs';
export const PAGE_WORK_LAYOUTS = ['table', 'board', 'calendar', 'gallery'];
// The document stores configuration only. No endpoint, workspace or record IDs
// are accepted from an authored block.
export function pageWorkConfiguration(attrs = {}) {
  if (attrs.source !== 'actions' || !PAGE_WORK_LAYOUTS.includes(attrs.view) ||
      !['', ...ACTION_STATUSES].includes(attrs.filter || '') ||
      !['', 'status'].includes(attrs.groupBy || '') || attrs.sort) return null;
  return {source: 'actions', view: attrs.view, filter: attrs.filter || '', groupBy: 'status', sort: ''};
}
