import {context as originalContext,time} from './_prospect-discovery-fixture.mjs';
const header=(name,value)=>({name,value});
const encode=(part,text)=>{part.body={size:Buffer.byteLength(text),data:Buffer.from(text).toString('base64url')};return part;};
const part=(type,text='',extra={})=>({...encode({mimeType:type,headers:[header('Content-Type',type)]},text),...extra});
const originalText=()=>`Message-ID: <returned-1@example.test>\r\nFrom: hello@example.test\r\nTo: person1@example.test\r\nSubject: PRIVATE_SUBJECT\r\n`;
const dsn=(recipient='person1@example.test',action='failed',status='5.1.1')=>`Reporting-MTA: dns; private-mta.example.test\r\nOriginal-Envelope-Id: PRIVATE_ENVELOPE\r\n\r\nFinal-Recipient: rfc822; ${recipient}\r\nAction: ${action}\r\nStatus: ${status}\r\nDiagnostic-Code: smtp; 550 PRIVATE_DIAGNOSTIC\r\n`;
export function fixture(){
 const context=structuredClone(originalContext);delete context.startHistoryId;
 context.candidate={workspaceId:context.workspaceId,accountEmail:context.accountEmail,providerMessageId:'dsn-1',providerThreadId:'new-thread',receivedAt:new Date(time+2000).toISOString(),kind:'delivery_report'};
 const message={id:'dsn-1',threadId:'new-thread',internalDate:String(time+2000),labelIds:['INBOX'],payload:{mimeType:'multipart/report',headers:[header('Content-Type','multipart/report; boundary="report-boundary"; report-type="delivery-status"'),header('Message-ID','<notice@example.test>'),header('From','mailer-daemon@example.test'),header('To','hello@example.test')],body:{size:0},parts:[part('text/plain','PRIVATE_HUMAN_TEXT'),part('message/delivery-status',dsn()),part('text/rfc822-headers',originalText())]}};
 return {context,message};
}
export {header,encode,part,originalText,dsn};
