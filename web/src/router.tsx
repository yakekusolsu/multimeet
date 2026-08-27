import type { AnchorHTMLAttributes, ReactNode } from 'react';

export function Link({
  href,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented && event.button === 0) {
          event.preventDefault();
          history.pushState({}, '', href);
          dispatchEvent(new PopStateEvent('popstate'));
        }
      }}
    >
      {children}
    </a>
  );
}
