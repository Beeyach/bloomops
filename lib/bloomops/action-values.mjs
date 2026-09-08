// Internal work vocabulary. Dependency blocking is a projection, never a status.
export const ACTION_STATUSES = ['to_do', 'in_progress', 'waiting', 'review', 'done', 'cancelled'];
export const ACTION_STATUS_LABELS = { to_do: 'To Do', in_progress: 'In Progress', waiting: 'Waiting', review: 'Review', done: 'Done', cancelled: 'Cancelled' };
export const ACTION_TRANSITIONS = {
  to_do: ['in_progress', 'waiting', 'cancelled'],
  in_progress: ['waiting', 'review', 'done', 'cancelled'],
  waiting: ['in_progress', 'review', 'done', 'cancelled'],
  review: ['in_progress', 'done', 'cancelled'],
  done: [], cancelled: [],
};
export const ACTION_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
export const ACTION_WAITING_TYPES = ['client', 'ellen', 'ary', 'team', 'external', 'dependency', 'other'];
export const ACTION_VIEWS = ['mine', 'today', 'upcoming', 'waiting', 'review', 'overdue', 'all'];
export const ACTION_DETAIL_FIELDS = ['title', 'description', 'priority', 'assigneeMembershipId', 'dueDate', 'milestoneId', 'visibility'];
export const ACTION_FILTER_FIELDS = ['clientId', 'departmentId', 'serviceEngagementId', 'projectId', 'assigneeMembershipId', 'status', 'priority'];
export const ACTION_LIMIT = 200;

export function actionCalendarDay(now, timezone = null) {
  // Client settings already validate IANA timezones. UTC is the existing
  // fallback when a Client has not chosen one; no new global timezone fact.
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
