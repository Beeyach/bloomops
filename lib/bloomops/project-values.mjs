// Shared Project vocabulary. No database or server imports: forms and the
// relational schema use the same values without shipping a data layer.
export const PROJECT_STATUSES = ['planned', 'ready', 'in_progress', 'waiting', 'blocked', 'review', 'completed', 'cancelled', 'archived'];
export const PROJECT_HEALTHS = ['on_track', 'needs_attention', 'at_risk'];
export const PROJECT_STATUS_LABELS = {
  planned: 'Planned', ready: 'Ready', in_progress: 'In Progress', waiting: 'Waiting',
  blocked: 'Blocked', review: 'Review', completed: 'Completed', cancelled: 'Cancelled', archived: 'Archived',
};
export const PROJECT_HEALTH_LABELS = { on_track: 'On Track', needs_attention: 'Needs Attention', at_risk: 'At Risk' };
export const PROJECT_TRANSITIONS = {
  planned: ['ready', 'cancelled'], ready: ['in_progress', 'cancelled'],
  in_progress: ['waiting', 'blocked', 'review', 'cancelled'],
  waiting: ['in_progress', 'cancelled'], blocked: ['in_progress', 'cancelled'],
  review: ['in_progress', 'completed', 'cancelled'], completed: ['archived'], cancelled: ['archived'], archived: [],
};
export const PROJECT_VISIBILITY_LABELS = { internal: 'Internal', client: 'Client visible', restricted: 'Restricted' };
export const PROJECT_DETAIL_FIELDS = ['name', 'clientLabel', 'startDate', 'targetDate', 'departmentId', 'visibility'];
export const PROJECT_DETAIL_LABELS = { name: 'name', clientLabel: 'client-facing label', startDate: 'start date', targetDate: 'target date', departmentId: 'department', visibility: 'visibility' };
export const PROJECT_STATUS_TONES = { planned: 'neutral', ready: 'info', in_progress: 'info', waiting: 'warning', blocked: 'error', review: 'info', completed: 'success', cancelled: 'neutral', archived: 'neutral' };
