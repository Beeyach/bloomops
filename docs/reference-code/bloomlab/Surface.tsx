/* Reference snapshot copied from Beeyach/Bloomlab/packages/design-system/src/primitives/Surface.tsx for BloomOps visual implementation. Reference-only; not runtime code. */
import type { ComponentPropsWithRef, ElementType, ReactNode } from 'react';

import { cx } from '../utils/cx';
import styles from './Surface.module.css';

export type SurfaceTone = 'snow' | 'mist' | 'tint';
export type SurfacePadding = 'none' | 'sm' | 'md' | 'lg';

const PADDING_CLASS: Record<SurfacePadding, string | undefined> = {
  none: undefined,
  sm: styles.padSm,
  md: styles.padMd,
  lg: styles.padLg,
};

export interface SurfaceProps extends ComponentPropsWithRef<'div'> {
  as?: ElementType;
  tone?: SurfaceTone;
  elevation?: 0 | 1 | 2;
  padding?: SurfacePadding;
  /** Hover lift for clickable surfaces; the caller supplies the interactive element semantics. */
  interactive?: boolean;
  children?: ReactNode;
}

/** Light container. Quiet by default — strong material belongs to HoloMaterial (DES-003). */
export function Surface({
  as: Tag = 'div',
  tone = 'snow',
  elevation = 0,
  padding = 'md',
  interactive = false,
  className,
  children,
  ...rest
}: SurfaceProps) {
  return (
    <Tag
      data-tone="light"
      className={cx(
        styles.surface,
        styles[tone],
        elevation === 1 && styles.elevation1,
        elevation === 2 && styles.elevation2,
        PADDING_CLASS[padding],
        interactive && styles.interactive,
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export interface InkSurfaceProps extends ComponentPropsWithRef<'div'> {
  as?: ElementType;
  /** `deep` for the Call Room and full-bleed workspaces. */
  depth?: 'ink' | 'deep';
  padding?: SurfacePadding;
  children?: ReactNode;
}

/** Dark workspace container (Workflow Lab, Call Room). Sets `data-tone="ink"` so children invert. */
export function InkSurface({
  as: Tag = 'div',
  depth = 'ink',
  padding = 'md',
  className,
  children,
  ...rest
}: InkSurfaceProps) {
  return (
    <Tag
      data-tone="ink"
      className={cx(
        styles.ink,
        depth === 'deep' && styles.inkDeep,
        PADDING_CLASS[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
