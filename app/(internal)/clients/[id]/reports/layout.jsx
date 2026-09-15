import '@/app/reports.css';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
export default async function ReportsLayout({children}){await requireShell('internal');return children;}
