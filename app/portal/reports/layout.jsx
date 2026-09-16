import '@/app/reports.css';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
export default async function Layout({children}){await requireShell('portal');return children;}
