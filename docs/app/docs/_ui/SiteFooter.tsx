import * as css from '@typedcss/css';
import Link from 'next/link';
import { GitHubIcon } from '../../GitHubIcon';
import { ExternalIcon } from './SiteHeader';
import { docs } from './theme';

const compact = '@container (max-width: 480px)';

const styles = css.create({
  footer: {
    paddingTop: 40,
    marginTop: 48,
    borderTopColor: docs.docBorder,
    borderTopStyle: 'solid',
    borderTopWidth: 1,
    containerType: 'inline-size',
  },
  groups: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, max-content)',
    gap: 32,
    justifyContent: 'space-between',
    [compact]: {
      gridTemplateColumns: 'repeat(2, max-content)',
      justifyContent: 'space-evenly',
    },
  },
  group: {
    textAlign: 'center',
  },
  heading: {
    margin: '0 0 16px',
    fontSize: 14,
    fontWeight: 600,
    color: docs.docFg,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    alignItems: 'center',
    padding: 0,
    margin: 0,
    listStyle: 'none',
  },
  link: {
    fontSize: 14,
    color: docs.docMuted,
    textDecoration: 'none',
    transitionDuration: '0.2s',
    ':hover': {
      color: docs.docFg,
    },
  },
  external: {
    display: 'inline-flex',
    gap: 4,
    alignItems: 'center',
  },
  legal: {
    position: 'relative',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 128,
    fontSize: 14,
    color: docs.docMuted,
    [compact]: {
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
  },
  social: {
    position: 'absolute',
    left: '50%',
    display: 'flex',
    gap: 16,
    translate: '-50% 0',
    [compact]: {
      position: 'static',
      flexBasis: '100%',
      justifyContent: 'center',
      marginTop: 24,
      translate: 'none',
    },
  },
});

const groups: {
  heading: string;
  links: { label: string; href: string; external?: boolean }[];
}[] = [
  {
    heading: 'Develop',
    links: [
      { label: 'API', href: '/docs/api' },
      { label: 'Testing', href: '/docs/testing' },
    ],
  },
  {
    heading: 'Explore',
    links: [
      { label: 'Playground', href: '/docs/playground' },
      { label: 'Migrating', href: '/docs/migrating' },
    ],
  },
  {
    heading: 'Participate',
    links: [
      {
        label: 'GitHub',
        href: 'https://github.com/zss-labs/typedcss',
        external: true,
      },
      { label: 'Acknowledgements', href: '/docs/acknowledgements' },
    ],
  },
  {
    heading: 'AI',
    links: [
      { label: 'AI.md', href: '/docs/ai.md', external: true },
      {
        label: 'AI Agent Resources',
        href: '/docs/ai-agent-resources',
        external: true,
      },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer sx={styles.footer}>
      <nav aria-label="Resources" sx={styles.groups}>
        {groups.map(({ heading, links }) => (
          <div key={heading} sx={styles.group}>
            <h2 sx={styles.heading}>{heading}</h2>
            <ul sx={styles.list}>
              {links.map(({ label, href, external }) => (
                <li key={label}>
                  {external ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      sx={[styles.link, styles.external]}
                    >
                      {label}
                      <ExternalIcon />
                    </a>
                  ) : (
                    <Link href={href} {...css.props(styles.link)}>
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div sx={styles.legal}>
        <span>© zss-labs contributors</span>
        <div sx={styles.social}>
          <a
            href="https://github.com/zss-labs/typedcss"
            target="_blank"
            rel="noreferrer noopener"
            aria-label="GitHub"
            sx={styles.link}
          >
            <GitHubIcon />
          </a>
        </div>
      </div>
    </footer>
  );
}
