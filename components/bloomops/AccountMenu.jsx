'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icons';
import UserAvatar from './UserAvatar';
import { signOutAndLeave } from './session-client.mjs';

// Who is signed in, and the way out. One component for the sidebar foot
// (opens upward, shows the name), the mobile top bar and the portal
// (compact, opens downward). Escape and a click outside close it; focus
// returns to the button.
export default function AccountMenu({ name, email, roleLabel, workspaceName, placement = 'up', compact = false, settingsHref = null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuId = useId();
  const displayName = name || email;

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointer(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    await signOutAndLeave('/sign-in');
  }

  return (
    <div className="bo-account" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`bo-account-btn${compact ? ' bo-account-btn-compact' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={compact ? `Account: ${displayName}` : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <UserAvatar seed={name||email} src="/api/bloomops/profile/photo"/>
        {!compact && (
          <span className="bo-account-text">
            <span className="bo-account-name">{displayName}</span>
            <span className="bo-account-role">{roleLabel}</span>
          </span>
        )}
        {!compact && <Icon name="chevron-down" size={16} className="bo-soft" />}
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="Account" className={`bo-menu ${placement === 'up' ? 'bo-menu-up' : 'bo-menu-down'}`}>
          <div className="bo-menu-identity">
            <div className="bo-account-name">{displayName}</div>
            <div className="bo-menu-email">{email}</div>
            <dl className="bo-menu-properties"><div><dt>Role</dt><dd>{roleLabel}</dd></div>{workspaceName&&<div><dt>Workspace</dt><dd>{workspaceName}</dd></div>}</dl>
          </div>
          <Link href="/profile" role="menuitem" className="bo-menu-item" onClick={()=>setOpen(false)}><Icon name="user" size={18} className="bo-soft"/>Your profile</Link>
          <Link href="/workspaces" role="menuitem" className="bo-menu-item" onClick={()=>setOpen(false)}><Icon name="team" size={18} className="bo-soft"/>Switch workspace</Link>
          {settingsHref && (
            <Link href={settingsHref} role="menuitem" className="bo-menu-item" onClick={() => setOpen(false)}>
              <Icon name="settings" size={18} className="bo-soft" />
              Settings
            </Link>
          )}
          <button type="button" role="menuitem" className="bo-menu-item" onClick={signOut} aria-disabled={busy || undefined}>
            <Icon name="sign-out" size={18} className="bo-soft" />
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
