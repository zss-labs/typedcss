'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function HeaderGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  return path === '/' || path.startsWith('/docs') || path === '/playground'
    ? children
    : null;
}
