export const DELIVERABLE_STATUSES = ['planned', 'in_progress', 'internal_review', 'client_review', 'approved', 'delivered', 'cancelled'];
export const DELIVERABLE_STATUS_LABELS = { planned: 'Planned', in_progress: 'In Progress', internal_review: 'Internal Review', client_review: 'Client Review', approved: 'Approved', delivered: 'Delivered', cancelled: 'Cancelled' };
export const DELIVERABLE_TRANSITIONS = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['internal_review', 'cancelled'],
  internal_review: ['in_progress', 'client_review', 'approved', 'cancelled'],
  client_review: ['in_progress', 'approved', 'cancelled'],
  approved: ['delivered', 'cancelled'],
  delivered: [], cancelled: [],
};
// Clients see delivery progress, without exposing the internal QA stage.
export const DELIVERABLE_PORTAL_STATUS_LABELS = { planned: 'Planned', in_progress: 'In progress', internal_review: 'In progress', client_review: 'Ready for review', approved: 'Approved', delivered: 'Delivered', cancelled: 'Cancelled' };
export const DELIVERABLE_DETAIL_FIELDS = ['title', 'clientLabel', 'description', 'visibility', 'targetDate'];
export const DELIVERABLE_LIMIT = 200;
