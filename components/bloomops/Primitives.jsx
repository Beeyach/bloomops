// The visual primitives A5 needs and no more: Button, Field, Status,
// PageHeader, Section, Surface, Facts, EmptyState, Notice, and the
// AreaPreview composition for areas that are not available yet. All of
// them are plain components without hooks so server components, client
// components, and render tests can use the same ones. Styling lives in
// app/bloomops.css under the matching `bo-` classes.
import { Icon } from './Icons';
import Garden from './Garden';

const cx = (...parts) => parts.filter(Boolean).join(' ');

// ── Button ────────────────────────────────────────────────────────────
//
// variant: primary | secondary | ghost | danger. `loading` shows a spinner,
// sets aria-busy, and ignores clicks. `href` renders a link with the same
// look, for navigation that reads as an action.
export function Button({ variant = 'secondary', size = 'md', loading = false, block = false, icon = null, href = null, className = '', type = 'button', onClick, disabled = false, children, ...rest }) {
  const classes = cx('bo-btn', variant !== 'secondary' && `bo-btn-${variant}`, size === 'sm' && 'bo-btn-sm', block && 'bo-btn-block', className);
  const inner = (
    <>
      {loading ? <span className="bo-spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={16} /> : null}
      <span>{children}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {inner}
      </a>
    );
  }
  // While loading, a click does nothing. A handler is attached only where
  // one could matter, so a server-rendered loading button (the gallery)
  // carries no event handler at all.
  const handleClick = loading ? (onClick || type === 'submit' ? (e) => e.preventDefault() : undefined) : onClick;
  return (
    <button
      type={type}
      className={classes}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      disabled={disabled}
      onClick={handleClick}
      {...rest}
    >
      {inner}
    </button>
  );
}

// ── Field ─────────────────────────────────────────────────────────────
//
// A real label, an optional hint, and an explicit error that is a
// sentence beside a glyph, never colour alone. The control is whatever
// the caller passes (input, select, textarea) with `id` matching.
export function Field({ id, label, hint = null, error = null, optional = false, children, className = '' }) {
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  return (
    <div className={cx('bo-field', className)}>
      <label htmlFor={id} className="bo-label">
        {label}
        {optional && <span className="bo-optional">(optional)</span>}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="bo-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="bo-field-error" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

// Describes the control for a Field: aria attributes the caller spreads.
export function fieldAria({ id, hint = null, error = null }) {
  const described = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ');
  return {
    id,
    'aria-describedby': described || undefined,
    'aria-invalid': error ? 'true' : undefined,
  };
}

// ── Status ────────────────────────────────────────────────────────────
//
// tone: neutral | success | warning | error | info. glyph: dot | check |
// clock | cross | dash. The label is always visible.
function Glyph({ glyph }) {
  switch (glyph) {
    case 'check':
      return <path d="M2 5.5l2.5 2.5L8 3" />;
    case 'cross':
      return <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />;
    case 'clock':
      return (
        <>
          <circle cx="5" cy="5" r="4" />
          <path d="M5 2.8V5l1.6 1" />
        </>
      );
    case 'dash':
      return <path d="M2 5h6" />;
    default:
      return <circle cx="5" cy="5" r="3.5" fill="currentColor" stroke="none" />;
  }
}

export function Status({ label, tone = 'neutral', glyph = 'dot', className = '' }) {
  return (
    <span className={cx('bo-status', tone !== 'neutral' && `bo-status-${tone}`, className)}>
      <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <Glyph glyph={glyph} />
      </svg>
      {label}
    </span>
  );
}

// ── Page structure ────────────────────────────────────────────────────

export function PageHeader({ title, subtitle = null, actions = null, titleId = 'page-title' }) {
  return (
    <div className="bo-page-header">
      <div className="bo-page-header-text">
        <h1 id={titleId} className="bo-display">
          {title}
        </h1>
        {subtitle && <p className="bo-lede">{subtitle}</p>}
      </div>
      {actions && <div className="bo-page-header-actions">{actions}</div>}
    </div>
  );
}

export function Section({ id, title, aside = null, children, className = '' }) {
  return (
    <section className={cx('bo-section', className)} aria-labelledby={`${id}-title`}>
      <div className="bo-section-head">
        <h2 id={`${id}-title`} className="bo-h2">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// tone: snow | mist | tint. Quiet by default.
export function Surface({ as: Tag = 'div', tone = 'snow', raised = false, padding = 'md', className = '', children, ...rest }) {
  return (
    <Tag
      className={cx('bo-surface', tone === 'mist' && 'bo-surface-mist', tone === 'tint' && 'bo-surface-tint', raised && 'bo-surface-raised', padding === 'md' && 'bo-pad', padding === 'lg' && 'bo-pad-lg', className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// Label / value pairs. `items` is [[label, value], ...].
export function Facts({ items, className = '' }) {
  return (
    <dl className={cx('bo-facts', className)}>
      {items.map(([label, value]) => (
        <div key={label} style={{ display: 'contents' }}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── States ────────────────────────────────────────────────────────────

export function EmptyState({ title, children, actions = null, className = '', icon = 'garden' }) {
  return (
    <div className={cx('bo-empty', className)}>
      {icon&&<span className="bo-empty-icon" aria-hidden="true">{icon==='garden'?<Garden variant={0}/>:<Icon name={icon} size={28}/>}</span>}
      <h2 className="bo-h2">{title}</h2>
      <div className="bo-body">{children}</div>
      {actions && <div className="bo-empty-actions">{actions}</div>}
    </div>
  );
}

// tone: info | success | warning | error
export function Notice({ tone = 'info', children, className = '', role = null }) {
  const glyph = tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'alert';
  return (
    <div className={cx('bo-notice', tone !== 'info' && `bo-notice-${tone}`, className)} role={role || (tone === 'error' ? 'alert' : 'status')}>
      <Icon name={glyph} size={18} />
      <div>{children}</div>
    </div>
  );
}

// An area that exists in the product's map but does no work yet: its
// purpose, what will live in it, and the plain statement that nothing
// here is live. No sample records, no counts, no controls.
export function AreaPreview({ title, purpose, items = [], note = 'This area is part of a later Bloomsi release. Nothing here is live yet.' }) {
  return (
    <>
      <PageHeader title={title} subtitle={purpose} />
      <Surface tone="mist" padding="lg" className="bo-page-narrow">
        <p className="bo-body">{note}</p>
        {items.length > 0 && (
          <ul className="bo-preview-list" aria-label={`What will live in ${title}`}>
            {items.map(([name, detail]) => (
              <li key={name}>
                <span className="bo-dot" aria-hidden="true" />
                <span>
                  <span className="bo-strong">{name}</span>
                  {detail && <span className="bo-small">{detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </>
  );
}
