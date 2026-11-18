import { theme } from '../theme';

import type { ReactNode } from 'react';
import Link from 'next/link';
import * as css from '@typedcss/css';

const styles = css.create({
  heading: {
    margin: '0 0 40px',
    fontSize: 'clamp(30px, 4.2vw, 44px)',
    fontWeight: 800,
    lineHeight: 1.08,
    textAlign: 'center',
    letterSpacing: '-0.035em',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 20,
    '@media (max-width: 900px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  card: {
    padding: '28px 28px 32px',
    backgroundColor: theme.panel,
    borderColor: theme.line,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 12,
  },
  icon: {
    display: 'block',
    color: theme.accentText,
  },
  title: {
    margin: '24px 0 10px',
    fontSize: 19,
    fontWeight: 700,
  },
  text: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.65,
    color: theme.muted,
  },
  link: {
    color: 'inherit',
    textDecorationLine: 'underline',
    textUnderlineOffset: 3,
    ':hover': {
      color: theme.fg,
    },
  },
});

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      {...css.props(styles.icon)}
    >
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div sx={styles.card}>
      <Icon d={icon} />
      <h3 sx={styles.title}>{title}</h3>
      <p sx={styles.text}>{children}</p>
    </div>
  );
}

export function Features() {
  return (
    <>
      <h2 sx={styles.heading}>What&apos;s in TypedCSS?</h2>
      <div sx={styles.grid}>
        <Feature
          icon="M12 3 4 6.5v5.2c0 4.4 3.4 8.4 8 9.3 4.6-.9 8-4.9 8-9.3V6.5L12 3Zm-3.5 9 2.5 2.5 4.5-5"
          title="Typed styles"
        >
          Every key and value is{' '}
          <Link href="/docs/api/types/Style" {...css.props(styles.link)}>
            typed
          </Link>
          . A misspelled style fails in the editor, before it ships.
        </Feature>
        <Feature
          icon="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"
          title="Atomic at build time"
        >
          <Link href="/docs/api/javascript/create" {...css.props(styles.link)}>
            css.create
          </Link>{' '}
          compiles to atomic classes, so a declaration ships once however many
          components use it.
        </Feature>
        <Feature
          icon="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"
          title="Merged on the element"
        >
          <Link href="/docs/api/javascript/props" {...css.props(styles.link)}>
            css.props
          </Link>{' '}
          picks the winner when the element renders, so a style can pass through
          props, context or packages first.
        </Feature>
      </div>
    </>
  );
}
