import GateForm from './GateForm';

export const dynamic = 'force-dynamic';

// The access-code screen. Nothing else in the app renders until a valid
// code sets a session. This page is exempt from the middleware gate.
export default function GatePage() {
  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-6">
      <GateForm />
    </main>
  );
}
