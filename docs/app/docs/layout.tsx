import * as css from '@typedcss/css';
import type { ReactNode } from 'react';
import { source } from '@/lib/source';
import { Sidebar } from './_ui/Sidebar';
import { SiteHeader } from './_ui/SiteHeader';
import { bp, docs } from './_ui/theme';

const styles = css.create({
  root: {
    minHeight: '100dvh',
    color: docs.docFg,
    background: docs.docBg,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns:
      '268px minmax(0, calc(50% + 80px)) 268px minmax(0, 1fr)',
    minHeight: 'calc(100dvh - 56px)',
    [bp.lg]: {
      gridTemplateColumns: '268px minmax(0, 1fr)',
    },
    [bp.md]: {
      display: 'block',
    },
  },
});

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div sx={styles.root}>
      <SiteHeader />
      <div sx={styles.grid}>
        <Sidebar tree={source.getPageTree()} />
        {children}
      </div>
    </div>
  );
}
