import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseProspectDeliveryStatus as parse} from '../lib/bloomops/prospect-delivery-status.mjs';
const recipient=(email='inbox@example.test',action='failed',status='5.1.1')=>`Final-Recipient: rfc822; ${email}\r\nAction: ${action}\r\nStatus: ${status}`;
const report=(part=recipient(),head='Reporting-MTA: dns; mx.example.test')=>head+'\r\n\r\n'+part+'\r\n';
const bad=value=>assert.deepEqual(parse(value),{status:'unresolved',recipients:[]});
test('reports only untrusted recipient/action/status facts, omitting diagnostic and envelope content',()=>{
 const result=parse(report(recipient()+'\r\nOriginal-Recipient: rfc822; Original@Example.test\r\nDiagnostic-Code: smtp; 550 PRIVATE_DIAGNOSTIC\r\nX-Private: PRIVATE_EXTENSION','Reporting-MTA: dns; private-mta.example.test\r\nOriginal-Envelope-Id: PRIVATE_ENVELOPE'));
 assert.deepEqual(result,{status:'parsed',recipients:[{finalRecipient:'inbox@example.test',originalRecipient:'original@example.test',action:'failed',statusCode:'5.1.1'}]});assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
for(const [action,status] of [['failed','5.1.1'],['failed','4.4.7'],['delayed','4.2.0'],['delivered','2.0.0'],['relayed','2.1.0'],['expanded','2.0.0']])test(action+' '+status+' remains independent reported facts',()=>{
 const r=parse(report(recipient('a@example.test',action,status)));assert.equal(r.status,'parsed');assert.equal(r.recipients[0].action,action);assert.equal(r.recipients[0].statusCode,status);assert.equal(Object.hasOwn(r,'hardBounce'),false);
});
test('folded fields, LF, case and multiple distinct recipients',()=>{
 const r=parse(report('FINAL-RECIPIENT: RFC822;\r\n\tONE@example.test\r\nACTION: FaIlEd\r\nSTATUS: 5.1.1\r\n\r\n'+recipient('two@example.test','delayed','4.0.0')).replaceAll('\r\n','\n'));assert.equal(r.status,'parsed');assert.equal(r.recipients.length,2);assert.equal(r.recipients[0].finalRecipient,'one@example.test');
});
for(const [name,value] of [
 ['invalid MTA labels',report(recipient(),'Reporting-MTA: dns; mx..example.test')],['invalid local part',report(recipient('a..b@example.test'))],['invalid domain labels',report(recipient('a@example..test'))],['missing MTA',report(recipient(),'X-Note: not-an-mta')],['missing recipient',report('Action: failed\r\nStatus: 5.1.1')],['missing action',report('Final-Recipient: rfc822; a@example.test\r\nStatus: 5.1.1')],['missing status',report('Final-Recipient: rfc822; a@example.test\r\nAction: failed')],
 ['duplicate field',report(recipient()+'\r\naCtIoN: failed')],['duplicate unknown field',report(recipient()+'\r\nX-Note: one\r\nx-note: two')],['duplicate recipient',report(recipient()+'\r\n\r\n'+recipient('INBOX@example.test'))],['recipient in message block',report(recipient(),'Reporting-MTA: dns; mx.example.test\r\nAction: failed')],['message field in recipient block',report(recipient()+'\r\nReporting-MTA: dns; mx.example.test')],
 ['orphan continuation',report(' folded\r\n'+recipient())],['bare CR',report().replace('Action','\rAction')],['control byte',report().replace('Action','\0Action')],['Unicode',report(recipient('é@example.test'))],['unsupported address type',report(recipient().replace('rfc822','utf-8'))],['display-name mailbox',report(recipient('Name <a@example.test>'))],['commented mailbox',report(recipient('a@example.test(note)'))],['unsupported MTA',report(recipient(),'Reporting-MTA: x400; arbitrary')],
 ['leading status zero',report(recipient('a@example.test','failed','5.01.1'))],['unknown status class',report(recipient('a@example.test','failed','3.1.1'))],['trailing status comment',report(recipient('a@example.test','failed','5.1.1 (unknown user)'))],['bad action',report(recipient('a@example.test','bounced'))],['empty block',report(recipient()+'\r\n\r\n\r\n'+recipient('two@example.test'))],
 ['partial multi-recipient',report(recipient()+'\r\n\r\nAction: failed')],['raw MIME',report('Content-Type: text/plain\r\n\r\nUndeliverable')],['subject-only fake', 'Subject: Undeliverable\r\nFrom: mailer-daemon@example.test'],['prototype field',report(recipient()+'\r\n__proto__: injected')],
])test(name+' yields no partial evidence',()=>bad(value));
test('input and physical/unfolded field limits',()=>{
 for(const x of [null,{},new Uint8Array(),'', 'a'.repeat(65537),report(recipient()+'\r\nX-Long: '+ 'a'.repeat(999)),report(recipient()+'\r\nX-Long: a'+('\r\n '+ 'a'.repeat(990)).repeat(9))])bad(x);
});
test('recipient and field-count limits',()=>{
 assert.equal(parse(report(Array.from({length:20},(_,i)=>recipient('a'+i+'@example.test')).join('\r\n\r\n'))).recipients.length,20);
 bad(report(Array.from({length:21},(_,i)=>recipient('a'+i+'@example.test')).join('\r\n\r\n')));
 bad(report(recipient()+Array.from({length:62},(_,i)=>'\r\nX-'+i+': value').join('')));
});

test('folding directly after a field colon is accepted',()=>{
 const r=parse(report(recipient().replace('Final-Recipient: rfc822;','Final-Recipient:\r\n rfc822;')));assert.equal(r.status,'parsed');assert.equal(r.recipients[0].finalRecipient,'inbox@example.test');
});
test('raw unfolded whitespace counts toward the field limit',()=>{
 bad(report(recipient()+'\r\nX-Long: a'+('\r\n'+' '.repeat(997)+'a').repeat(9)));
 const prefix=recipient()+'\r\nX-Long:';
 const wrapped=n=>{let value='';while(n>0){const count=Math.min(998,n);value+='\r\n'+' '.repeat(count-1)+'a';n-=count;}return report(prefix+value);};
 assert.equal(parse(wrapped(8192)).status,'parsed');bad(wrapped(8193));
});
test('supported optional standard fields are checked then discarded',()=>{
 const r=parse(report(recipient()+'\r\nRemote-MTA: dns; other.example.test\r\nDiagnostic-Code: smtp; 550 Unavailable\r\nLast-Attempt-Date: Sun, 13 Sep 2026 12:34:56 +0000\r\nWill-Retry-Until: 14 Sep 2026 12:34 -0700\r\nFinal-Log-Id: opaque identifier','Reporting-MTA: dns; mx.example.test\r\nArrival-Date: 13 Sep 2026 12:00:00 +0000\r\nDSN-Gateway: dns; gateway.example.test\r\nReceived-From-MTA: dns; source.example.test'));
 assert.equal(r.status,'parsed');assert.deepEqual(Object.keys(r.recipients[0]),['finalRecipient','originalRecipient','action','statusCode']);
});
for(const [name,value,message] of [
 ['diagnostic separator','Diagnostic-Code: missing-semicolon',false],['diagnostic type','Diagnostic-Code: x400; unknown',false],['diagnostic empty','Diagnostic-Code: smtp; ',false],['remote MTA','Remote-MTA: dns; mx..invalid.test',false],['gateway MTA','DSN-Gateway: dns; mx../invalid',true],['received MTA','Received-From-MTA: other; something',true],['arrival nonsense','Arrival-Date: nonsense',true],['invalid day','Arrival-Date: 30 Feb 2026 12:00 +0000',true],['weekday mismatch','Last-Attempt-Date: Mon, 13 Sep 2026 12:00 +0000',false],['invalid clock','Last-Attempt-Date: 13 Sep 2026 25:00 +0000',false],['unsupported timezone','Will-Retry-Until: 13 Sep 2026 12:00 GMT',false],['invalid offset','Will-Retry-Until: 13 Sep 2026 12:00 +0060',false],
])test('malformed or unsupported optional '+name+' yields no partial facts',()=>bad(message?report(recipient(),'Reporting-MTA: dns; mx.example.test\r\n'+value):report(recipient()+'\r\n'+value)));
