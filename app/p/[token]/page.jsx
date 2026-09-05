import PublicReader from '../../../components/PublicReader';

// A 'use client' file cannot export route config, so this stays a server
// component whose only job is to keep the route dynamic and hand the token to
// the client reader.
export const dynamic = 'force-dynamic';

export default async function PublicPage({ params }) {
  const { token } = await params;
  return <PublicReader token={token} />;
}
