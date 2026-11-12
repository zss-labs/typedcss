import * as css from '@typedcss/css';
import Link from 'next/link';
import { version } from '../../../../packages/css/package.json';
import { GitHubIcon } from '../../GitHubIcon';
import { Logo } from '../../Logo';
import { PopoverAutoClose } from './PopoverAutoClose';
import { Search } from './Search';
import { ThemeSwitch } from './ThemeSwitch';
import { bp, docs } from './theme';

const styles = css.create({
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 40,
    height: 56,
    color: docs.docFg,
    background: docs.docBg,
    borderBottomColor: docs.docBorder,
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    WebkitTapHighlightColor: 'transparent',
  },
  nav: {
    position: 'relative',
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    height: '100%',
    paddingInline: 24,
    [bp.md]: {
      gap: 16,
      paddingInline: 16,
    },
  },
  brand: {
    display: 'flex',
    gap: 5,
    alignItems: 'center',
    fontSize: 15,
    fontWeight: 650,
    letterSpacing: '-0.03em',
    textDecoration: 'none',
  },
  version: {
    padding: '1px 8px',
    fontSize: 12,
    fontWeight: 500,
    lineHeight: '18px',
    textDecoration: 'none',
    background: docs.docAccent,
    borderRadius: 9999,
    transitionDuration: '0.2s',
    ':hover': {
      opacity: 0.7,
    },
  },
  toggle: {
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    marginLeft: -6,
    color: 'inherit',
    cursor: 'pointer',
    background: 'none',
    borderWidth: 0,
    borderRadius: 6,
    ':hover': {
      background: docs.docAccent,
    },
    [bp.md]: {
      display: 'inline-flex',
    },
  },
  menu: {
    position: 'static',
    display: 'flex',
    flex: 1,
    gap: 24,
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 'auto',
    height: 'auto',
    padding: 0,
    margin: 0,
    overflow: 'visible',
    color: 'inherit',
    background: 'none',
    borderWidth: 0,
    '@starting-style': {
      ':popover-open': {
        transform: 'translateY(-8px)',
        opacity: 0,
      },
    },
    [bp.md]: {
      position: 'fixed',
      inset: '55px 0 auto',
      display: 'none',
      flexDirection: 'column',
      gap: 0,
      alignItems: 'stretch',
      padding: 16,
      background: docs.docBg,
      borderColor: docs.docBorder,
      borderStyle: 'solid',
      borderWidth: '0 0 1px',
      borderRadius: '0 0 16px 16px',
      transform: 'translateY(-8px)',
      transition:
        'opacity 0.2s ease, transform 0.2s ease, display 0.2s allow-discrete, overlay 0.2s allow-discrete',
      opacity: 0,
      ':popover-open': {
        display: 'flex',
        transform: 'none',
        opacity: 1,
      },
    },
  },
  link: {
    fontSize: 14,
    color: docs.docMuted,
    textDecoration: 'none',
    transitionDuration: '0.2s',
    ':hover': {
      color: docs.docFg,
    },
    [bp.md]: {
      paddingBlock: 8,
      fontSize: 16,
      color: docs.docFg,
    },
  },
  external: {
    display: 'inline-flex',
    gap: 4,
    alignItems: 'center',
  },
  actions: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    [bp.md]: {
      justifyContent: 'space-between',
      paddingTop: 16,
    },
  },
  iconLink: {
    display: 'inline-flex',
    padding: 6,
    color: docs.docMuted,
    borderRadius: 6,
    transitionDuration: '0.2s',
    ':hover': {
      color: docs.docFg,
      background: docs.docAccent,
    },
    [bp.md]: {
      marginRight: -6,
    },
  },
});

export const ExternalIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M11 5H4v15h15v-7" />
    <path d="M14 3h7v7M21 3 11 13" />
  </svg>
);

export function SiteHeader() {
  return (
    <header sx={styles.header}>
      <nav sx={styles.nav}>
        <Link href="/" {...css.props(styles.brand)}>
          <Logo size={20} />
          TypedCSS
        </Link>
        <a
          href={`https://www.npmjs.com/package/@typedcss/css/v/${version}`}
          target="_blank"
          rel="noreferrer noopener"
          sx={styles.version}
        >
          v{version}
        </a>
        <Search />
        <button
          type="button"
          popoverTarget="docs-menu"
          aria-label="Toggle Menu"
          sx={styles.toggle}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="12" cy="5" r="2.2" />
            <circle cx="12" cy="12" r="2.2" />
            <circle cx="12" cy="19" r="2.2" />
          </svg>
        </button>
        <div id="docs-menu" popover="auto" sx={styles.menu}>
          <PopoverAutoClose id="docs-menu" />
          <Link href="/docs" {...css.props(styles.link)}>
            Docs
          </Link>
          <Link href="/playground" {...css.props(styles.link)}>
            Playground
          </Link>
          <a href="/docs/ai.md" sx={styles.link}>
            AI.md
          </a>
          <a
            href="https://plumeria.dev"
            target="_blank"
            rel="noreferrer noopener"
            sx={[styles.link, styles.external]}
          >
            Plumeria
            <ExternalIcon />
          </a>
          <div sx={styles.actions}>
            <ThemeSwitch />
            <a
              href="https://github.com/zss-labs/typedcss"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="GitHub"
              sx={styles.iconLink}
            >
              <GitHubIcon />
            </a>
          </div>
        </div>
      </nav>
    </header>
  );
}
