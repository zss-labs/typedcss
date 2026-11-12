import * as css from '@typedcss/css';
import Link from 'next/link';
import { theme } from './theme';

const styles = css.create({
  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100dvh',
    padding: 16,
    textAlign: 'center',
  },
  code: {
    margin: 0,
    fontSize: 64,
    fontWeight: 600,
    lineHeight: 1,
    color: theme.accent,
    letterSpacing: '-0.04em',
  },
  text: {
    margin: 0,
    fontSize: 16,
    color: theme.muted,
  },
  link: {
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 500,
    color: theme.fg,
    textDecoration: 'none',
    borderColor: theme.line,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 9999,
    ':hover': {
      background: theme.hover,
    },
  },
});

export default function NotFound() {
  return (
    <main sx={styles.main}>
      <h1 sx={styles.code}>404</h1>
      <p sx={styles.text}>This page could not be found.</p>
      <Link href="/docs" {...css.props(styles.link)}>
        Back to the docs
      </Link>
    </main>
  );
}
