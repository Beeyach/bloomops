'use client';
import { Button, Notice, PageHeader } from '@/components/bloomops/Primitives';
export default function ContentError({ reset }) {
  return <><PageHeader title="Your content" /><Notice tone="error">Your content could not be loaded. Please try again.</Notice>
    <div className="bo-portal-content-actions"><Button onClick={reset}>Try again</Button><Button href="/portal" variant="ghost">Back to home</Button></div></>;
}
