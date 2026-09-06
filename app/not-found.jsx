import AuthShell from '@/components/auth/AuthShell';
import { Button } from '@/components/bloomops/Primitives';

// Nothing at this address. The root route sends each role to its own
// home, so one link is enough.
export const metadata = { title: 'Not found' };

export default function NotFound() {
  return (
    <AuthShell title="There is nothing here" lead="The address may be wrong, or the page may have moved.">
      <Button href="/" variant="primary" block>
        Go to BloomOps
      </Button>
    </AuthShell>
  );
}
