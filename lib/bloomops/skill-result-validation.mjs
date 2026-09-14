// Validator for the closed Draft7 vocabulary used by the built-in skill schemas.
// Schemas are repository-owned, never provided by an uploaded result.
const types={object:v=>v!==null&&typeof v==='object'&&!Array.isArray(v),array:Array.isArray,string:v=>typeof v==='string',null:v=>v===null,integer:Number.isSafeInteger};
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const formats={date,'date-time':v=>date(v.slice(0,10))&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i.test(v)&&Number.isFinite(Date.parse(v)),uri:v=>{try{return Boolean(new URL(v).protocol);}catch{return false;}},email:v=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)};
export function skillResultErrors(value,schema,path='result'){
 const errors=[],bad=message=>errors.push(`${path}: ${message}`);
 if(schema.type&&![schema.type].flat().some(t=>types[t]?.(value))){bad('Use the required value type.');return errors;}
 if(Object.hasOwn(schema,'const')&&value!==schema.const)bad('Use the required value.');
 if(schema.enum&&!schema.enum.includes(value))bad('Choose a supported value.');
 if(typeof value==='string'){
  const length=[...value].length;
  if(schema.minLength!==undefined&&length<schema.minLength||schema.maxLength!==undefined&&length>schema.maxLength)bad('Check the text length.');
  if(schema.pattern&&!new RegExp(schema.pattern).test(value))bad('Use readable text in the required format.');
  if(schema.format&&!formats[schema.format]?.(value))bad('Use a valid '+schema.format+'.');
 }
 if(typeof value==='number'&&schema.minimum!==undefined&&value<schema.minimum)bad('Use a valid revision.');
 if(types.object(value)){
  for(const key of schema.required||[])if(!Object.hasOwn(value,key))bad('Missing '+key+'.');
  if(schema.additionalProperties===false&&Object.keys(value).some(k=>!Object.hasOwn(schema.properties||{},k)))bad('Remove unsupported fields.');
  for(const [key,child] of Object.entries(schema.properties||{}))if(Object.hasOwn(value,key))errors.push(...skillResultErrors(value[key],child,path+'.'+key));
 }
 if(Array.isArray(value)){
  if(schema.minItems!==undefined&&value.length<schema.minItems||schema.maxItems!==undefined&&value.length>schema.maxItems)bad('Check the number of items.');
  if(Array.isArray(schema.items)){value.forEach((item,i)=>{if(schema.items[i])errors.push(...skillResultErrors(item,schema.items[i],path+'['+i+']'));else if(schema.additionalItems===false)bad('Remove extra items.');});}
  else if(schema.items)value.forEach((item,i)=>errors.push(...skillResultErrors(item,schema.items,path+'['+i+']')));
  if(schema.contains&&!value.some(item=>!skillResultErrors(item,schema.contains).length))bad('Include a dated, sourced observed interaction.');
 }
 if(schema.anyOf&&!schema.anyOf.some(s=>!skillResultErrors(value,s).length))bad('Use one of the required formats.');
 for(const rule of schema.allOf||[])if(!rule.if||!skillResultErrors(value,rule.if).length)errors.push(...skillResultErrors(value,rule.then||rule,path));
 return errors;
}
