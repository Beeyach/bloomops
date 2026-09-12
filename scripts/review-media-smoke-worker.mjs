import assert from 'node:assert/strict';
import { reviewMediaAcceptance } from './review-media-acceptance.mjs';
import * as oldApp from 'e3a-baseline';
export default {async fetch(request,env){
 if(env.E3A_DISPOSABLE!=='local-only'||new URL(request.url).hostname!=='localhost')return new Response(null,{status:403});
 const messages=[];
 try{await reviewMediaAcceptance(env.DB,env.FILES,E3A_MIGRATIONS,(name,ok)=>{assert.ok(ok,name);messages.push(name);},oldApp);return Response.json({messages,checks:messages.length});}
 catch(error){return Response.json({messages,error:error.stack},{status:500});}
}};
