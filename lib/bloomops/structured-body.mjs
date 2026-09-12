import {InvalidBodyError} from './api-handler.mjs';
// Bound decoded form data before JSON parsing, including chunked requests.
export async function readStructuredBody(request){
 const reader=request.body?.getReader();if(!reader)throw new InvalidBodyError();
 const chunks=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw new InvalidBodyError();}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body;}catch{throw new InvalidBodyError();}
}
