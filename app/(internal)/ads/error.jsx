'use client';
import { Button, Notice, PageHeader } from '@/components/bloomops/Primitives';
export default function AdsError({ reset }) {
  return <><PageHeader title="Ads" /><Notice tone="error">Ads projects could not be loaded. Please try again.</Notice>
    <div className="bo-cluster"><Button onClick={reset}>Try again</Button><Button href="/ads" variant="ghost">Reset filters</Button></div></>;
}
