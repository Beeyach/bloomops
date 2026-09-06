'use client';

import AuthShell from '@/components/auth/AuthShell';
import { Button } from '@/components/bloomops/Primitives';

// Route-level error boundary: a render throw anywhere below the root
// layout lands here instead of a blank screen. Plain words, two ways
// out. The error itself goes to the console for whoever is debugging;
// its message is not shown, because it is written for developers.
export default function AppError({ error, reset }) {
  if (typeof console !== 'undefined' && error) console.error(error);
  return (
    <AuthShell title="Something went wrong on this screen" lead="Your data is safe. This is a display problem, and trying again usually clears it.">
      <div className="bo-cluster">
        <Button variant="primary" onClick={() => reset()}>
          Try again
        </Button>
        <Button onClick={() => window.location.reload()}>Reload the page</Button>
      </div>
    </AuthShell>
  );
}
