import PublicReader from '../../../components/PublicReader';

// next-on-pages requires every route to declare the edge runtime, and a
// 'use client' file cannot export route config. So this stays a server
// component whose only job is to declare the runtime and hand the token to
// the client reader. (Both Cloudflare builds failed on exactly this.)
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function PublicPage({ params }) {
  const { token } = await params;
  return <PublicReader token={token} />;
}
