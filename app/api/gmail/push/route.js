import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Shutdown 2026-08-27: the app no longer reads Gmail.
//
// This endpoint used to receive Gmail Pub/Sub push notifications, enqueue a
// GMAIL_SYNC job, and run it inline. The drain was locked to SEND_APPROVED
// jobs in the same shutdown, but this path was missed -- notifications kept
// arriving and triggering syncs for three more days until the watch expired.
//
// The endpoint stays and returns 200 so Pub/Sub stops retrying. Returning a
// non-2xx would make Google retry for days, and the watch will lapse on its
// own (seven-day TTL, no renewal since the daily wake was retired).
export async function POST() {
  return NextResponse.json({ ok: true, note: 'mailbox sync retired' });
}
