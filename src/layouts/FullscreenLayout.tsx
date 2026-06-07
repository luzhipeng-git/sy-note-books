import type { ReactNode } from 'react';

interface FullscreenLayoutProps {
  children: ReactNode;
}

export function FullscreenLayout({ children }: FullscreenLayoutProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--main-bg)',
      }}
    >
      {children}
    </div>
  );
}
