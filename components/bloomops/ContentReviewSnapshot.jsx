import { Facts } from './Primitives';
import { CONTENT_TYPE_LABELS } from '@/lib/bloomops/content-values.mjs';
export default function ContentReviewSnapshot({snapshot}) {
  return <div className="bo-review-snapshot">
    <h3 className="bo-h2">{snapshot.title}</h3>
    <Facts items={[["Format",CONTENT_TYPE_LABELS[snapshot.type]||snapshot.type],["Platforms",snapshot.platforms.join(', ')||'Not specified'],["Target publish date",snapshot.targetPublishDate||'Not set']]} />
    {Object.entries({hook:'Hook',script:'Script',caption:'Caption',cta:'Call to action'}).map(([key,label])=>snapshot[key]&&<section key={key} className="bo-review-copy"><h4 className="bo-label">{label}</h4><p className="bo-content-copy">{snapshot[key]}</p></section>)}
  </div>;
}
