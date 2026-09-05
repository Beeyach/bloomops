import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Deliberately minimal. Every inherited route is dynamic and reads per-request
// state from D1, so there is no ISR output to cache and nothing to revalidate.
// Add an R2 incremental cache here only when a route actually produces one.
export default defineCloudflareConfig({});
