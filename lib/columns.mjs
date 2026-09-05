// One place for the column lists the API selects.
//
// These were previously copy-pasted into each route. Twice now a migration
// added a column, one copy was updated and another was not, and the field
// silently never reached the client: first `confidence` (an unverifiable lead
// landed in Qualified), then five columns on the promote route (a lead lost
// your own verdict override the moment you promoted it). Nothing errors when
// this drifts, which is what makes it worth centralising.
//
// Adding a column to a migration means adding it here, once.

export const LEAD_COLUMNS =
  'id, platform, post_url, post_text, author_name, author_handle, email, signals, verdict, verdict_reasons, confidence, verdict_source, your_note, lead_kind, dest_url, notes, status, promoted_prospect_id, avatar_url, created_at, updated_at';

// The list endpoint's fast first paint. Measured on the live data (Aug 2026):
// the full row set is ~4.1MB of JSON and ~3.6MB of it is five TEXT blobs the
// table never renders (email_sequence 1.4MB, info 1.1MB, audit_notes 1.0MB,
// the two sent-mail records 0.2MB). ?slim=1 serves everything EXCEPT those,
// the client paints the table from it, then swaps in the full rows in the
// background. Keep this list in step with PROSPECT_COLUMNS below.
export const SLIM_PROSPECT_COLUMNS =
  'id, name, business_name, email, domain, rating, stage, emails_sent, last_contact_date, last_contact_at, claude_chat_link, gmail_labels, is_read, country, pdf_filename, review_url, replied, reply_date, reply_at, reply_type, replied_at_email, next_action_date, source, niche, call_booked, proposal_sent, must_haves, revenue_score, video_url, video_tier, video_score, video_reasons, site_intel, site_intel_at, site_intel_source, signals, pending_draft, pending_draft_at, pending_draft_stale, do_not_contact, unsubscribed, video_sent_at, first_client_at, source_provider, contact_state, verification_state, priority_band, band_was_provisional, origin_class, origin_batch, deferred_until, offer_accepted_at, activity_log, created_at, updated_at';

export const PROSPECT_COLUMNS =
  'id, name, business_name, email, domain, rating, stage, emails_sent, last_contact_date, last_contact_at, claude_chat_link, gmail_labels, is_read, country, email_sequence, audit_notes, pdf_filename, info, review_url, replied, reply_date, reply_at, reply_type, replied_at_email, next_action_date, source, niche, call_booked, proposal_sent, must_haves, revenue_score, video_url, video_tier, video_score, video_reasons, own_findings, site_intel, site_intel_at, site_intel_source, signals, pending_draft, pending_draft_at, pending_draft_stale, do_not_contact, unsubscribed, video_sent_at, video_sent_email, playbook_sent_email, legacy_backfill_at, legacy_backfill_result, legacy_message_count, first_client_at, qualification, source_provider, source_ref, source_at, pending_draft_meta, contact_searched_at, contact_search_result, contact_search_pages, contact_refresh_after, primary_contact_reason, pending_draft_dismissed_at, contact_state, contact_state_at, contact_state_reason, verification_state, verification_reason, verification_state_at, priority_band, band_was_provisional, band_at, origin_class, origin_subtype, origin_batch, origin_query, origin_at, deferred_until, deferral_reason, deferral_promise, deferral_context, deferral_source, offer_accepted_at, offer_accepted_step, activity_log, created_at, updated_at';
