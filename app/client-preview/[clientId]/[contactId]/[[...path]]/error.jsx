'use client';
import { Button, Notice } from '@/components/bloomops/Primitives';
export default function PreviewError({ reset }) {
  return <div className="bo-root bo-portal"><main className="bo-portal-page"><h1 className="bo-h1">Client preview unavailable</h1><Notice tone="error">Shared work could not be loaded. Try again to check current access.</Notice><div className="bo-form-actions"><Button onClick={reset}>Try again</Button><Button href="/clients">Exit preview</Button></div></main></div>;
}
