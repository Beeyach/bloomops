#!/usr/bin/env node
// Read-only public staging baseline. It cannot sign in or send email and is
// explicitly not a measurement of authenticated navigation.
const rows=[];
for(let round=0;round<10;round++)for(const path of ['/api/version','/api/health','/sign-in','/systems']) {
  const start=performance.now();
  const response=await fetch('https://bloomops-staging.cool-sunset-2169.workers.dev'+path,{redirect:'manual'});
  const ttfbMs=performance.now()-start;
  await response.arrayBuffer();
  rows.push({round,path,status:response.status,ttfbMs,totalMs:performance.now()-start,colo:response.headers.get('cf-ray')?.split('-').at(-1)});
}
console.log(JSON.stringify({type:'unauthenticated-public-only',warmups:2,rows},null,2));
