'use client';
export default function Error({reset}){return <div role="alert"><p>Reports could not be loaded.</p><button className="bo-button" onClick={reset}>Retry reports</button></div>;}
