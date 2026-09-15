// Error receipts must not export even disposable QA authentication material.
export function reportBrowserError(error) {
 return String(error?.message ?? error)
  .replace(/https?:\/\/\S*(?:magic-link|invite)\S*/gi,'[local authentication URL redacted]')
  .replace(/([?&](?:token|secret|key)=)[^\s&]+/gi,'$1[REDACTED]')
  .replace(/(bearer\s+)[\w.~-]+/gi,'$1[REDACTED]');
}
