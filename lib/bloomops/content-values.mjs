// One product vocabulary for storage, validation and presentation. C2 owns transitions.
export const CONTENT_TYPE_LABELS = { reel: 'Reel', static_post: 'Static Post', carousel: 'Carousel', story: 'Story', video: 'Video', email: 'Email', ad_creative: 'Ad Creative', other: 'Other' };
export const CONTENT_TYPES = Object.keys(CONTENT_TYPE_LABELS);
export const CONTENT_STAGE_LABELS = { idea: 'Idea', script: 'Script', waiting_for_recording: 'Waiting for Recording', editing: 'Editing', internal_review: 'Internal Review', client_review: 'Client Review', revision_requested: 'Revision Requested', approved: 'Approved', scheduled: 'Scheduled', published: 'Published' };
export const CONTENT_STAGES = Object.keys(CONTENT_STAGE_LABELS);
export const CONTENT_TEXT_LIMITS = { title: 200, pillar: 120, hook: 2000, script: 20000, caption: 10000, cta: 1000 };
export const CONTENT_FLAG_DEFAULTS = { recordingRequired: false, internalReviewRequired: true, clientApprovalRequired: true };
export const CONTENT_DETAIL_FIELDS = [...Object.keys(CONTENT_TEXT_LIMITS), 'type', 'ownerMembershipId', ...Object.keys(CONTENT_FLAG_DEFAULTS), 'targetPublishDate', 'visibility'];
export const CONTENT_QUERY_FIELDS = ['clientId', 'serviceEngagementId', 'type', 'ownerMembershipId', 'stage', 'page'];
export const CONTENT_PAGE_SIZE = 200;
export const CONTENT_VISIBILITY_LABELS = { internal: 'Internal', client: 'Client eligible', restricted: 'Restricted' };
