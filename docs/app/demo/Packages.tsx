import { theme } from '../theme';

import * as css from '@typedcss/css';

const PAIRS = [
  ['css', 'core'],
  ['oxide', 'compiler'],
  ['next-plugin', 'next-plugin'],
  ['unplugin', 'unplugin'],
  ['eslint-plugin', 'eslint-plugin'],
  ['init', 'init'],
  ['codemod', 'codemod'],
  ['swc-jest', 'swc-jest'],
  ['wind', 'wind'],
] as const;

const LINE = 'rgba(128, 128, 128, 0.22)';

const styles = css.create({
  card: {
    flexShrink: 0,
    width: 'min(100%, 440px)',
    overflow: 'hidden',
    borderColor: LINE,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 8,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 20px minmax(0, 1fr)',
    alignItems: 'center',
    borderTopColor: LINE,
    borderTopStyle: 'solid',
    borderTopWidth: 1,
    ':hover': {
      backgroundColor: 'rgba(128, 128, 128, 0.1)',
    },
  },
  head: {
    borderTopWidth: 0,
    ':hover': {
      backgroundColor: 'transparent',
    },
  },
  scope: {
    padding: '7px 12px',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    fontWeight: 600,
  },
  typed: {
    color: theme.accentText,
  },
  plumeria: {
    color: '#d653bb',
  },
  link: {
    padding: '4px 12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontFamily: 'var(--mono)',
    fontSize: 12,
    color: theme.fg,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    ':hover': {
      color: theme.accentText,
    },
  },
  muted: {
    color: theme.muted,
    ':hover': {
      color: '#d653bb',
    },
  },
  swap: {
    fontSize: 11,
    color: 'rgba(128, 128, 128, 0.7)',
    textAlign: 'center',
  },
});

export function Packages() {
  return (
    <div sx={styles.card}>
      <div sx={[styles.row, styles.head]}>
        <span sx={[styles.scope, styles.typed]}>@typedcss/</span>
        <span sx={styles.swap}>⇄</span>
        <span sx={[styles.scope, styles.plumeria]}>@plumeria/</span>
      </div>
      {PAIRS.map(([typedcss, plumeria]) => (
        <div key={typedcss} sx={styles.row}>
          <a
            href={`https://www.npmjs.com/package/@typedcss/${typedcss}`}
            sx={styles.link}
          >
            {typedcss}
          </a>
          <span sx={styles.swap}>⇄</span>
          <a
            href={`https://www.npmjs.com/package/@plumeria/${plumeria}`}
            sx={[styles.link, styles.muted]}
          >
            {plumeria}
          </a>
        </div>
      ))}
    </div>
  );
}
