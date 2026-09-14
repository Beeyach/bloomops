'use client';
import { useEffect, useState } from 'react';
import { Button, Notice } from './Primitives';

// No shared browser cache. Recheck on focus/pageshow and while visible. A
// failed check removes all preview content; every destination checks again.
export default function ClientPreviewGuard({ checkUrl, exitHref, children }) {
  const [valid, setValid] = useState(true);
  useEffect(() => {
    let stopped = false, pending = false;
    const check = async () => {
      if (stopped || pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const result = await fetch(checkUrl, { cache: 'no-store', redirect: 'error' });
        if (!stopped && !result.ok) setValid(false);
      } catch { if (!stopped) setValid(false); }
      finally { pending = false; }
    };
    const timer = setInterval(check, 10000);
    window.addEventListener('focus', check); window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', check);
    check();
    return () => { stopped = true; clearInterval(timer); window.removeEventListener('focus', check); window.removeEventListener('pageshow', check); document.removeEventListener('visibilitychange', check); };
  }, [checkUrl]);
  if (!valid) return <div className="bo-portal-page"><Notice tone="error">Preview is unavailable. Access changed or could not be checked.</Notice><Button href={exitHref}>Return to client</Button></div>;
  return children;
}
