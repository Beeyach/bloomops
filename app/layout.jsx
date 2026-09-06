import './globals.css';
import './bloomops.css';

export const metadata = {
  title: { default: 'BloomOps', template: '%s · BloomOps' },
  description: 'Post-sale agency operations and client portal.',
};

export const viewport = {
  // Cloud, the BloomOps ground (app/bloomops.css). The inherited
  // application updates this itself when it mounts.
  themeColor: '#F8FAFF',
};

// The boot script is the SOLE owner of html[data-theme] and html[data-textsize].
// Those attributes drive the INHERITED application (app/legacy) only; BloomOps
// surfaces read their own tokens (app/bloomops.css) and look the same under
// either value. It always sets a value (stored preference, else light) before first paint, so
// there is no flash. The attributes are deliberately NOT in the JSX — if they
// were, React hydration would re-apply the JSX value over the stored
// preference. globals.css keeps :root fallback = light so a blocked script
// still paints, and Comfortable carries no attribute at all.
//
// Chapter 9 added the text size. It is set here rather than in a React effect
// for the same reason as the theme: resizing every word on the page one frame
// after it appears is worse than the flash it replaces.
const themeBoot = `(function(){var t,z;try{t=localStorage.getItem('ltb_theme');z=localStorage.getItem('ltb_textsize_v1')}catch(e){}var d=document.documentElement;d.dataset.theme=t==='dark'?'dark':'light';if(z==='large'||z==='comfortable'){d.dataset.textsize=z}else{delete d.dataset.textsize}})()`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      {/* No background class here — body must stay transparent so the
          fixed z-index:-2 GlassBackdrop shows through (see globals.css). */}
      <body className="text-charcoal font-sans antialiased">{children}</body>
    </html>
  );
}
