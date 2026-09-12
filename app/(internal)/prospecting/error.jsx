'use client';
import {Button} from '@/components/bloomops/Primitives';
export default function ProspectingError({reset}){return <section className="bo-prospect-page"><h1>Prospecting is temporarily unavailable</h1><p className="bo-body">Please try again.</p><Button onClick={reset}>Try again</Button><Button href="/workspaces" variant="ghost">Choose workspace</Button></section>;}
