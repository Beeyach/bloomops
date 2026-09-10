import { PageHeader } from '@/components/bloomops/Primitives';
export default function LoadingSystems() {
  return <><PageHeader title="Systems" /><p className="bo-body" role="status" aria-busy="true">Loading Systems projects…</p></>;
}
