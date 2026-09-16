// Keep the navigation fallback server-renderable: it must not import the
// full interactive sheet before the loading boundary can paint.
export default function Loading(){return <div className="bo-prospect-page"><h1 className="bo-display">Prospects</h1><p role="status" className="bo-small">Opening your prospect workspace…</p><div className="bo-sheet-skeleton" aria-hidden="true">{Array.from({length:6},(_,i)=><div key={i}>{Array.from({length:5},(_,j)=><span key={j}/>)}</div>)}</div>;}
