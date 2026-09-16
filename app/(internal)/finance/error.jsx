'use client';
import {Button} from '@/components/bloomops/Primitives';
export default function FinanceError({reset}){return <section><h1 className="bo-h1">Finance could not load</h1><p role="alert">Your saved records have not changed. Retry this view.</p><Button onClick={()=>reset()}>Retry Finance</Button><Button href="/finance">Finance records</Button></section>;}
