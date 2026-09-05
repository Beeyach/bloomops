// Four buckets for the stage filter and the breakdown chart. This groups the
// existing stages visually only — nothing is renamed, and every individual
// stage stays selectable inside its group. Order within a group follows the
// pipeline's own order.
export const STAGE_GROUPS = [
  {
    key: 'pipeline',
    label: 'Pipeline',
    stages: ['New', 'Prescreen', 'Validated', 'Email 1', 'Email 2', 'Email 3', 'Email 4', 'Email 5', 'Finished'],
  },
  {
    key: 'warm',
    label: 'Warm',
    stages: ['Replied', 'Interested', 'Engaged', 'Rekindled', 'Setup Check', 'Proposal Sent'],
  },
  {
    key: 'closed',
    label: 'Closed',
    stages: ['Client', 'Rejected', 'Lost', 'Invalid Email'],
  },
  {
    key: 'parked',
    label: 'Parked',
    stages: ['Snoozed', 'Not This Offer', 'Social Media', 'Followed', 'Connected', 'Story Reply', 'DM 1', 'DM 2', 'DM 3', 'Voice Note'],
  },
];

// Buckets whatever stages actually exist (the live `stages` list) into the
// four groups, preserving each group's declared order. Any stage not named in
// a group lands in a trailing "Other" group, so a new or unmapped stage can
// never silently vanish from the filter or the chart. Empty groups drop out.
export function groupStages(stages) {
  const present = new Set(stages || []);
  const used = new Set();
  const groups = STAGE_GROUPS.map((g) => {
    const items = g.stages.filter((st) => present.has(st));
    items.forEach((st) => used.add(st));
    return { key: g.key, label: g.label, stages: items };
  });
  const other = (stages || []).filter((st) => !used.has(st));
  if (other.length) groups.push({ key: 'other', label: 'Other', stages: other });
  return groups.filter((g) => g.stages.length > 0);
}
