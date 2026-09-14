import BrandLogo from '@/components/bloomops/BrandLogo';
export default function LoadingPreview() {
  return <div className="bo-root bo-portal"><header className="bo-topbar"><BrandLogo/></header><main className="bo-portal-page" aria-busy="true"><h1 className="bo-h1">Client preview</h1><p role="status" className="bo-body">Checking access and loading shared work…</p></main></div>;
}
