import { theme } from '../theme';

import type { ReactNode } from 'react';
import Link from 'next/link';
import * as css from '@typedcss/css';

const styles = css.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 16,
    '@media (max-width: 1000px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
    '@media (max-width: 560px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    color: 'inherit',
    textDecoration: 'none',
    backgroundColor: theme.bg,
    borderColor: theme.line,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 8,
    ':hover': {
      borderColor: theme.accent,
    },
  },
  preview: {
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
    height: 148,
    overflow: 'hidden',
    backgroundColor: theme.panel,
    borderBottomColor: theme.line,
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    fontSize: 14,
    fontWeight: 600,
  },
  arrow: {
    color: theme.faint,
  },
  list: {
    width: 150,
    backgroundColor: theme.bg,
    borderColor: theme.line,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 8,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 26,
    padding: '0 8px',
    borderTopColor: theme.line,
    borderTopStyle: 'solid',
    borderTopWidth: 1,
    ':first-child': {
      borderTopWidth: 0,
    },
  },
  bar: {
    width: 56,
    height: 5,
    backgroundColor: theme.line,
    borderRadius: 3,
  },
  dots: {
    position: 'relative',
    fontSize: 11,
    lineHeight: 1,
    color: theme.muted,
  },
  menu: {
    position: 'absolute',
    right: -4,
    bottom: 'calc(100% + 6px)',
    display: 'grid',
    gap: 5,
    width: 72,
    padding: 7,
    backgroundColor: theme.bg,
    borderColor: theme.line,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 6,
    boxShadow: '0 6px 16px rgb(0 0 0 / 0.16)',
  },
  item: {
    height: 4,
    backgroundColor: theme.line,
    borderRadius: 2,
  },
  swatches: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 22px)',
    gap: 5,
  },
  swatch: {
    height: 22,
    borderRadius: 4,
  },
  sand: {
    backgroundColor: '#d9b99b',
  },
  tide: {
    backgroundColor: '#547b7c',
  },
  bloom: {
    backgroundColor: '#dc9e91',
  },
  moss: {
    backgroundColor: '#788b77',
  },
  morph: {
    display: 'flex',
    gap: 14,
    alignItems: 'center',
  },
  hero: {
    width: 86,
    height: 64,
    borderRadius: 8,
  },
  pair: {
    display: 'flex',
    gap: 10,
  },
  surface: {
    display: 'grid',
    gap: 8,
    width: 78,
    padding: 10,
    borderRadius: 8,
  },
  light: {
    backgroundColor: '#f5f6f8',
    borderColor: '#cbd1dc',
    borderStyle: 'solid',
    borderWidth: 1,
  },
  dark: {
    backgroundColor: '#1c1f27',
    borderColor: '#2a2f3a',
    borderStyle: 'solid',
    borderWidth: 1,
  },
  text: {
    width: '70%',
    height: 5,
    borderRadius: 3,
  },
  lightText: {
    backgroundColor: '#596273',
  },
  darkText: {
    backgroundColor: '#a4acbd',
  },
  button: {
    height: 16,
    borderRadius: 4,
  },
  lightButton: {
    backgroundColor: '#365dcc',
  },
  darkButton: {
    backgroundColor: '#5b8cff',
  },
  merge: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    fontFamily: 'var(--mono)',
    fontSize: 11,
  },
  chips: {
    display: 'grid',
    gap: 5,
  },
  chip: {
    padding: '3px 7px',
    color: theme.muted,
    borderColor: theme.line,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 5,
  },
  winner: {
    color: theme.accentText,
    borderColor: theme.accent,
  },
  badge: {
    padding: '6px 12px',
    fontFamily: 'inherit',
    fontWeight: 600,
    color: 'black',
    backgroundColor: 'skyblue',
    borderRadius: 999,
  },
});

function Example({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} {...css.props(styles.card)}>
      <div sx={styles.preview} aria-hidden>
        {children}
      </div>
      <span sx={styles.label}>
        {title}
        <span sx={styles.arrow}>→</span>
      </span>
    </Link>
  );
}

export function Examples() {
  return (
    <div sx={styles.grid}>
      <Example href="/playground?example=position-try" title="Anchor Fallbacks">
        <div sx={styles.list}>
          <div sx={styles.row}>
            <span sx={styles.bar} />
            <span sx={styles.dots}>⋯</span>
          </div>
          <div sx={styles.row}>
            <span sx={styles.bar} />
            <span sx={styles.dots}>⋯</span>
          </div>
          <div sx={styles.row}>
            <span sx={styles.bar} />
            <span sx={styles.dots}>
              ⋯
              <span sx={styles.menu}>
                <span sx={styles.item} />
                <span sx={styles.item} />
                <span sx={styles.item} />
              </span>
            </span>
          </div>
        </div>
      </Example>
      <Example
        href="/playground?example=view-transition"
        title="View Transitions"
      >
        <div sx={styles.morph}>
          <div sx={styles.swatches}>
            <span sx={[styles.swatch, styles.sand]} />
            <span sx={[styles.swatch, styles.tide]} />
            <span sx={[styles.swatch, styles.bloom]} />
            <span sx={[styles.swatch, styles.moss]} />
          </div>
          <span sx={styles.arrow}>→</span>
          <span sx={[styles.hero, styles.tide]} />
        </div>
      </Example>
      <Example href="/playground" title="Themes">
        <div sx={styles.pair}>
          <div sx={[styles.surface, styles.light]}>
            <span sx={[styles.text, styles.lightText]} />
            <span sx={[styles.text, styles.lightText]} />
            <span sx={[styles.button, styles.lightButton]} />
          </div>
          <div sx={[styles.surface, styles.dark]}>
            <span sx={[styles.text, styles.darkText]} />
            <span sx={[styles.text, styles.darkText]} />
            <span sx={[styles.button, styles.darkButton]} />
          </div>
        </div>
      </Example>
      <Example href="/playground?example=merge" title="Last style wins">
        <div sx={styles.merge}>
          <div sx={styles.chips}>
            <span sx={styles.chip}>base</span>
            <span sx={styles.chip}>rounded</span>
            <span sx={[styles.chip, styles.winner]}>sky</span>
          </div>
          <span sx={styles.arrow}>→</span>
          <span sx={styles.badge}>Button</span>
        </div>
      </Example>
    </div>
  );
}
