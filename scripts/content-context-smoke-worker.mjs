import { contentContextAcceptance } from './content-context-acceptance.mjs';
export default { async fetch(request,env) {
  if(env.E2A_DISPOSABLE!=='local-only'||new URL(request.url).hostname!=='localhost')return new Response(null,{status:403});
  const messages=[];
  try {
    await contentContextAcceptance(env.DB,E2A_MIGRATIONS,(name,ok)=>{if(!ok)throw new Error(name);messages.push(name);});
    return Response.json({checks:messages.length,messages});
  } catch(error) {return Response.json({messages,error:String(error.stack||error)},{status:500});}
}};
