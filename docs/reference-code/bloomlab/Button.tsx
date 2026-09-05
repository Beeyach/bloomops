/* Reference snapshot copied from Beeyach/Bloomlab/packages/design-system/src/primitives/Button.tsx for BloomOps visual implementation. Reference-only; not runtime code. */
import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../utils/cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets `aria-busy`, and ignores clicks until done. */
  loading?: boolean;
  /** Decorative icon before the label. */
  icon?: ReactNode;
  /** Decorative icon after the label. */
  iconEnd?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  iconEnd,
  className,
  children,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], size === 'sm' && styles.sm, className)}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={loading ? (event) => event.preventDefault() : onClick}
      {...rest}
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : (
        icon && (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        )
      )}
      <span className={styles.label}>{children}</span>
      {iconEnd && !loading && (
        <span className={styles.icon} aria-hidden="true">
          {iconEnd}
        </span>
      )}
    </button>
  );
}
