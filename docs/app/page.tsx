import { theme } from './theme';
import * as css from '@typedcss/css';

const title = 'TypedCSS — Type-safe atomic CSS-in-JS';
const description =
  'TypedCSS is type-safe atomic CSS-in-JS with build-time compilation and a runtime fallback for dynamic style composition. Works with Next.js, Vite, webpack, and more.';
const images = '/api/ogp/home/og.png';

export const metadata = {
  alternates: { canonical: '/' },
  openGraph: { title, description, images },
  twitter: { title, description, images },
};
import { CopyCommand } from './CopyCommand';
import { SiteFooter } from './docs/_ui/SiteFooter';
import { Logo } from './Logo';
import { LiveCode, LiveDemo, LivePreview } from './demo/Editor';
import { Bench } from './demo/Bench';
import { Bundlers } from './demo/Bundlers';
import { Examples } from './demo/Examples';
import { Features } from './demo/Features';
import { Packages } from './demo/Packages';
import { source, tokenize } from './highlight';
import Link from 'next/link';
import { siteUrl } from '@/lib/site';

const home = siteUrl.toString();

const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${home}#website`,
      url: home,
      name: 'TypedCSS',
      description:
        'TypedCSS is type-safe atomic CSS-in-JS with build-time compilation and a runtime fallback for dynamic style composition. Works with Next.js, Vite, webpack, and more.',
      publisher: { '@id': `${home}#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${home}#organization`,
      name: 'TypedCSS',
      url: home,
      sameAs: ['https://github.com/zss-labs/typedcss'],
    },
  ],
}).replace(/</g, '\\u003c');

const USAGE = `export function Button() {
  return (
    <button sx={[styles.base, styles.rounded, styles.sky]}>Button</button>
  );
}`;

const written = `${source('demo/styles.ts')}\n\n${USAGE}`;

const styles = css.create({
  page: {
    maxWidth: 1200,
    padding: '0 24px',
    margin: '0 auto',
    '@media (max-width: 640px)': {
      padding: '0 16px',
    },
  },
  hero: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
    gap: 48,
    alignItems: 'center',
    padding: '104px 0 80px',
    '@media (max-width: 900px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
      padding: '56px 0',
    },
  },
  title: {
    margin: 0,
    fontSize: 'clamp(34px, 6.6vw, 54px)',
    fontWeight: 800,
    lineHeight: 1.04,
    letterSpacing: '-0.045em',
  },
  accent: {
    color: theme.accent,
  },
  lead: {
    maxWidth: 620,
    margin: '28px 0 40px',
    fontSize: 20,
    lineHeight: 1.55,
    color: theme.muted,
  },
  split: {
    display: 'flex',
    gap: 72,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '136px 0 0',
    '@media (max-width: 900px)': {
      flexDirection: 'column',
      gap: 32,
      alignItems: 'stretch',
      padding: '88px 0 0',
    },
  },
  splitText: {
    maxWidth: 440,
  },
  heading: {
    margin: 0,
    fontSize: 'clamp(30px, 4.2vw, 44px)',
    fontWeight: 800,
    lineHeight: 1.08,
    letterSpacing: '-0.035em',
  },
  text: {
    margin: '20px 0 28px',
    fontSize: 17,
    color: theme.muted,
  },
  sectionHeading: {
    marginBottom: 32,
  },
  section: {
    paddingTop: 136,
    '@media (max-width: 900px)': {
      paddingTop: 88,
    },
  },
  commands: {
    display: 'grid',
    gap: 12,
    justifyItems: 'start',
  },
  start: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  getStarted: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 46,
    padding: '0 24px',
    fontSize: 15,
    fontWeight: 600,
    color: theme.bg,
    textDecoration: 'none',
    backgroundColor: theme.accent,
    borderRadius: 999,
    boxShadow:
      '0 0 0 1px rgba(45, 212, 191, 0.4), 0 8px 24px rgba(45, 212, 191, 0.24)',
    ':hover': {
      opacity: 0.88,
    },
  },
  playground: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 46,
    padding: '0 24px',
    fontSize: 15,
    fontWeight: 600,
    color: theme.fg,
    textDecoration: 'none',
    backgroundColor: theme.hover,
    borderRadius: 999,
    ':hover': {
      opacity: 0.8,
    },
  },
  install: {
    display: 'flex',
    flexWrap: 'wrap',
    gridColumn: '1 / -1',
    gap: '16px 40px',
    alignItems: 'center',
  },
  heroLogo: {
    display: 'flex',
    justifyContent: 'center',
    '@media (max-width: 900px)': {
      order: -1,
      zoom: 0.6,
    },
  },
  pipeline: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 24,
    '@media (max-width: 900px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
});

export default async function Home() {
  const write = await tokenize(written);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <div sx={styles.page}>
        <main>
          <section sx={styles.hero}>
            <div>
              <h1 sx={styles.title}>
                TypedCSS
                <br />
                <span sx={styles.accent}>The right side always wins</span>
              </h1>
              <p sx={styles.lead}>
                Type-safe atomic CSS-in-JS. Styles compile at build time. What
                the build can’t settle merges on the element.
              </p>
              <div sx={styles.start}>
                <Link href="/docs" {...css.props(styles.getStarted)}>
                  Get Started →
                </Link>
                <Link href="/playground" {...css.props(styles.playground)}>
                  Playground
                </Link>
              </div>
            </div>
            <div sx={styles.heroLogo}>
              <Logo size={320} />
            </div>
            <div sx={styles.install}>
              <CopyCommand command="npx @typedcss/init" />
              <Bundlers />
            </div>
          </section>

          <LiveDemo lines={write}>
            <div sx={styles.pipeline}>
              <LiveCode />
              <LivePreview />
            </div>
          </LiveDemo>

          <section sx={styles.section}>
            <Bench />
          </section>

          <section sx={styles.section}>
            <Features />
          </section>

          <section sx={styles.section}>
            <h2 sx={[styles.heading, styles.sectionHeading]}>
              Open any of them in the playground.
            </h2>
            <Examples />
          </section>

          <section sx={styles.split}>
            <div sx={styles.splitText}>
              <h2 sx={styles.heading}>One API, two models.</h2>
              <p sx={styles.text}>
                Plumeria merges at build time, TypedCSS on the element. The
                source is the same, and a codemod moves it either way.
              </p>
              <div sx={styles.commands}>
                <CopyCommand command="npx @plumeria/codemod migrate-to-typedcss" />
                <CopyCommand command="npx @typedcss/codemod migrate-to-plumeria" />
              </div>
            </div>
            <Packages />
          </section>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
