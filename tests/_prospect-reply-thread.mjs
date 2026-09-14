export const context = {
  accountEmail: 'primary@example.test',
  receipt: {state: 'accepted', accountEmail: 'primary@example.test', providerMessageId: 'sent-message',
    providerThreadId: 'sent-thread', messageId: '<bloomsi-12345678-1234-1234-1234-123456789012@bloomsi.invalid>'},
  snapshot: {sender: {email: 'hello@example.test'}, draft: {recipient: 'person@example.test'}},
};
export function message(id, headers = {}, options = {}) {
  const {labels = ['INBOX'], date = '1789286401000', ...rest} = options;
  return {id, threadId: context.receipt.providerThreadId, labelIds: labels, internalDate: date,
    payload: {headers: Object.entries({'Message-ID': '<' + id + '@example.test>', From: 'Person <person@example.test>',
      To: 'hello@example.test', 'In-Reply-To': context.receipt.messageId, ...headers}).map(([name, value]) => ({name, value}))}, ...rest};
}
export function thread(...messages) {
  return {id: context.receipt.providerThreadId, messages: [message('sent-message', {
    'Message-ID': context.receipt.messageId, From: 'Ary at Bloomwired <hello@example.test>', To: 'Person <person@example.test>',
  }, {labels: ['SENT'], date: '1789286400000'}), ...messages]};
}
