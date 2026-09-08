// Shared vocabulary only; progress always comes from the caller's readable rows.
export const MILESTONE_STATUSES = ['upcoming', 'in_progress', 'waiting', 'completed', 'skipped'];
export const MILESTONE_STATUS_LABELS = { upcoming: 'Upcoming', in_progress: 'In Progress', waiting: 'Waiting', completed: 'Completed', skipped: 'Skipped' };
export const MILESTONE_TRANSITIONS = {
  upcoming: ['in_progress', 'waiting', 'skipped'],
  in_progress: ['waiting', 'completed', 'skipped'],
  waiting: ['in_progress', 'completed', 'skipped'],
  completed: [], skipped: [],
};
export const MILESTONE_DETAIL_FIELDS = ['name', 'clientLabel', 'startDate', 'targetDate', 'visibility'];
export const MILESTONE_LIMIT = 200;
export function milestoneProgress(items) {
  if (!items.length) return null;
  const finished = items.filter(item => ['completed', 'skipped'].includes(item.status)).length;
  return { total: items.length, finished, percentage: Math.round(finished / items.length * 100) };
}
