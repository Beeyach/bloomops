import { sanitizePublicHtml } from '../sanitize-public-html.mjs';
import { renderEquationsForPublic } from '../public-equations.mjs';

export const previewBase = (clientId, contactId) => `/client-preview/${encodeURIComponent(clientId)}/${encodeURIComponent(contactId)}`;
export const previewApiBase = (clientId, contactId) => `/api/bloomops/client-preview/${encodeURIComponent(clientId)}/${encodeURIComponent(contactId)}`;

// Authored links never run with the staff viewer's broader authority. Only
// known read destinations are navigable. Other links retain their visible copy.
export function previewDocument(source, base, apiBase) {
  return renderEquationsForPublic(sanitizePublicHtml(source, { documentFormatting: true,
    urlPolicy(tag, attribute, value) {
      if (tag === 'img' && attribute === 'src' && value.startsWith('data:image/')) return value;
      if (tag === 'a' && attribute === 'href' && /^#[A-Za-z0-9_-]+$/.test(value)) return value;
      const page = value.match(/^\/(?:portal\/)?pages\/([A-Za-z0-9-]+)(#[A-Za-z0-9_-]+)?$/);
      if (tag === 'a' && page) return `${base}/pages/${page[1]}${page[2] || ''}`;
      const file = value.match(/^\/api\/bloomops\/files\/([A-Za-z0-9-]+)\/download$/);
      if (file) return `${apiBase}/files/${file[1]}`;
      return null;
    },
  }), { maxEquations: 30, maxSourceLength: 4096 });
}
