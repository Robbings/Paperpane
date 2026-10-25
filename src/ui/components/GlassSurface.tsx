import { createElement, type HTMLAttributes, type ReactNode } from 'react';

type GlassTag = 'div' | 'section' | 'aside' | 'nav' | 'header' | 'footer';

interface GlassSurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: GlassTag;
  /** float: menus and popovers · bar: toolbars and rails · panel: sidebars and research area */
  tone?: 'float' | 'bar' | 'panel';
  radius?: 'control' | 'float' | 'panel' | 'pill';
  children?: ReactNode;
}

/** The glass material from styles/base.css. Use for fixed chrome, never behind long text. */
export function GlassSurface({ as = 'div', tone = 'float', radius = 'float', className, children, ...rest }: GlassSurfaceProps) {
  return createElement(
    as,
    {
      ...rest,
      className: className ? `pp-glass ${className}` : 'pp-glass',
      'data-tone': tone,
      'data-radius': radius,
    },
    children,
  );
}
