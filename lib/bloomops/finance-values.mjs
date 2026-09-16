// Shared validation/formatting only; authority always remains server-side.
export const FINANCE_STATUSES = {invoice:['draft','sent','paid','overdue','void'],payment:['pending','completed','failed','refunded']};
export const FINANCE_FIELDS = ['title','amount','currency','status','dueDate','paidDate','renewalDate','provider','reference','notes','archived'];
export const FINANCE_CURRENCIES = Intl.supportedValuesOf('currency');
export const financeLabel = value => value[0].toUpperCase()+value.slice(1);
export const currencyDigits = currency => new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits;
export function financeAmount(minor,digits){
 const n=BigInt(minor),negative=n<0n,abs=negative?-n:n,s=abs.toString().padStart(digits+1,'0');
 return (negative?'-':'')+(digits?s.slice(0,-digits)+'.'+s.slice(-digits):s);
}
export function financeDate(value){
 if(value===null||value==='')return null;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'9999-12-31')return undefined;
 const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?value:undefined;
}
export function financeInput(input,type,pinnedDigits=null){
 const invalid=error=>({error});
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!FINANCE_FIELDS.includes(k)))return invalid('Unknown Finance field.');
 if(!['invoice','payment'].includes(type)||!FINANCE_STATUSES[type].includes(input.status))return invalid('Choose a valid record status.');
 if(!FINANCE_CURRENCIES.includes(input.currency))return invalid('Choose a supported currency.');
 const digits=pinnedDigits??currencyDigits(input.currency);
 if(typeof input.amount!=='string'||!/^\d{1,13}(?:\.\d{1,4})?$/.test(input.amount)||((input.amount.split('.')[1]||'').length>digits))return invalid(`Enter an exact nonnegative amount with at most ${digits} decimal places.`);
 const [whole,fraction='']=input.amount.split('.'),minor=BigInt(whole)*10n**BigInt(digits)+BigInt(fraction.padEnd(digits,'0')||'0');
 if(minor>1000000000000n)return invalid('Amount exceeds the supported manual-record limit.');
 const value={currency:input.currency,currencyDigits:digits,amountMinor:Number(minor),status:input.status};
 for(const [field,max,required] of [['title',160,true],['provider',160],['reference',160],['notes',8000]]){
  const v=input[field]??'';if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)||required&&!v.trim())return invalid(`Enter a valid ${field} (maximum ${max} characters).`);
  value[field]=v.trim();
 }
 for(const field of ['dueDate','paidDate','renewalDate']){value[field]=financeDate(input[field]??null);if(value[field]===undefined)return invalid(`Enter a valid ${field.replace('Date',' date')}.`);}
 if(['paid','completed','refunded'].includes(value.status)&&!value.paidDate)return invalid('A paid date is required for this status.');
 if(!['paid','completed','refunded'].includes(value.status)&&value.paidDate)return invalid('Remove the paid date for an unpaid status.');
 if(value.status==='overdue'&&!value.dueDate)return invalid('An Overdue invoice needs a due date.');
 if(typeof input.archived!=='boolean')return invalid('Invalid archive state.');value.archived=input.archived?1:0;
 return {value};
}
