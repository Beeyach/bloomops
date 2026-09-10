'use client';
import { Button, Notice, PageHeader } from '@/components/bloomops/Primitives';
export default function SystemsError({ reset }) {
  return <><PageHeader title="Systems" /><Notice tone="error">Systems projects could not be loaded. Please try again.</Notice>
    <div className="bo-cluster"><Button onClick={reset}>Try again</Button><Button href="/systems" variant="ghost">Reset filters</Button></div></>;
}
