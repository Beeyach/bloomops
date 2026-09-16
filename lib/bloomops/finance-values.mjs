// Shared validation/formatting only; authority always remains server-side.
export const FINANCE_STATUSES = {invoice:['draft','sent','paid','overdue','void'],payment:['pending','completed','failed','refunded']};
export const FINANCE_FIELDS = ['title','amount','currency','status','dueDate','paidDate','renewalDate','provider','reference','notes','archived'];
// Frozen supported manual-currency catalogue; server and browser must not diverge
// when their ICU versions differ. Existing records additionally pin their precision.
const CURRENCY_DIGITS = Object.freeze({"AED":2,"AFN":0,"ALL":0,"AMD":2,"ANG":2,"AOA":2,"ARS":2,"AUD":2,"AWG":2,"AZN":2,"BAM":2,"BBD":2,"BDT":2,"BGN":2,"BHD":3,"BIF":0,"BMD":2,"BND":2,"BOB":2,"BRL":2,"BSD":2,"BTN":2,"BWP":2,"BYN":2,"BZD":2,"CAD":2,"CDF":2,"CHF":2,"CLP":0,"CNY":2,"COP":0,"CRC":2,"CUC":2,"CUP":2,"CVE":2,"CZK":2,"DJF":0,"DKK":2,"DOP":2,"DZD":2,"EGP":2,"ERN":2,"ETB":2,"EUR":2,"FJD":2,"FKP":2,"GBP":2,"GEL":2,"GHS":2,"GIP":2,"GMD":2,"GNF":0,"GTQ":2,"GYD":2,"HKD":2,"HNL":2,"HRK":2,"HTG":2,"HUF":0,"IDR":0,"ILS":2,"INR":2,"IQD":0,"IRR":0,"ISK":0,"JMD":2,"JOD":3,"JPY":0,"KES":2,"KGS":2,"KHR":2,"KMF":0,"KPW":0,"KRW":0,"KWD":3,"KYD":2,"KZT":2,"LAK":0,"LBP":0,"LKR":2,"LRD":2,"LSL":2,"LYD":3,"MAD":2,"MDL":2,"MGA":0,"MKD":2,"MMK":0,"MNT":2,"MOP":2,"MRU":2,"MUR":2,"MVR":2,"MWK":2,"MXN":2,"MYR":2,"MZN":2,"NAD":2,"NGN":2,"NIO":2,"NOK":2,"NPR":2,"NZD":2,"OMR":3,"PAB":2,"PEN":2,"PGK":2,"PHP":2,"PKR":0,"PLN":2,"PYG":0,"QAR":2,"RON":2,"RSD":2,"RUB":2,"RWF":0,"SAR":2,"SBD":2,"SCR":2,"SDG":2,"SEK":2,"SGD":2,"SHP":2,"SLE":2,"SLL":0,"SOS":0,"SRD":2,"SSP":2,"STN":2,"SVC":2,"SYP":0,"SZL":2,"THB":2,"TJS":2,"TMT":2,"TND":3,"TOP":2,"TRY":2,"TTD":2,"TWD":2,"TZS":2,"UAH":2,"UGX":0,"USD":2,"UYU":2,"UZS":2,"VES":2,"VND":0,"VUV":0,"WST":2,"XAF":0,"XCD":2,"XCG":2,"XDR":2,"XOF":0,"XPF":0,"XSU":2,"YER":0,"ZAR":2,"ZMW":2,"ZWG":2,"ZWL":2});
export const FINANCE_CURRENCIES = Object.keys(CURRENCY_DIGITS);
export const financeLabel = value => value[0].toUpperCase()+value.slice(1);
export const currencyDigits = currency => CURRENCY_DIGITS[currency];
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
