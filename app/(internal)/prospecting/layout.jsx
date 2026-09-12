import '../../prospecting.css';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
export const dynamic='force-dynamic';
export default async function ProspectingLayout({children}){await requireShell('internal');return children;}
