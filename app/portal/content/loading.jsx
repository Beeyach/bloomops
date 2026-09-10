import { PageHeader } from '@/components/bloomops/Primitives';
export default function LoadingContent() {
  return <><PageHeader title="Your content" /><p className="bo-body" role="status" aria-busy="true">Loading your content…</p></>;
}
