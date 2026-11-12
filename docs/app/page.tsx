import { theme } from './theme';
import type { ReactNode } from 'react';
import * as css from '@typedcss/css';

export const metadata = { alternates: { canonical: '/' } };
import { CopyCommand } from './CopyCommand';
import { Logo } from './Logo';
import { SiteFooter } from './docs/_ui/SiteFooter';
import { SiteHeader } from './docs/_ui/SiteHeader';
import { CompiledCode, Editor, ImportAnimation } from './demo/Editor';
import { Merge } from './demo/Merge';
import { styles as graph } from './demo/graph';
import { styles as merge } from './demo/styles';
import { highlight, source, tokenize } from './highlight';
import Link from 'next/link';

const PACKAGES = [
  ['@typedcss/css', '@plumeria/core'],
  ['@typedcss/oxide', '@plumeria/compiler'],
  ['@typedcss/next-plugin', '@plumeria/next-plugin'],
  ['@typedcss/unplugin', '@plumeria/unplugin'],
  ['@typedcss/eslint-plugin', '@plumeria/eslint-plugin'],
  ['@typedcss/init', '@plumeria/init'],
  ['@typedcss/codemod', '@plumeria/codemod'],
  ['@typedcss/swc-jest', '@plumeria/swc-jest'],
  ['@typedcss/wind', '@plumeria/wind'],
];

const USAGE = `<div
  sx={[styles.base, styles.pill, styles.sky]}
/>`;

const TREE = [
  ['padding', 0, true],
  ['├─ padding-block', 1, true],
  ['│  ├─ padding-top', 2, true],
  ['│  └─ padding-bottom', 2, false],
  ['└─ padding-inline', 1, false],
  ['   ├─ padding-left', 2, false],
  ['   └─ padding-right', 2, false],
] as const;

const RULES = [
  { name: graph.box.padding, depth: 0, rule: 'padding: 48px' },
  { name: graph.box.paddingBlock, depth: 1, rule: 'padding-block: 32px' },
  { name: graph.box.paddingTop, depth: 2, rule: 'padding-top: 16px' },
];

const sheet = (rules: typeof RULES) =>
  rules
    .map(
      ({ name, depth, rule }) =>
        `.${name}${':not(#\\#)'.repeat(depth)} { ${rule} }`,
    )
    .join('\n');

const inlined = `<div\n  className="${css.props(merge.base, merge.pill, merge.sky).className}"\n/>`;
const compiled = inlined;
const written = `${source('demo/styles.ts')}\n\n${USAGE}`;
const offset = written.slice(0, written.indexOf('<div')).split('\n').length - 1;
const align = (code: string, comment = '') =>
  comment + '\n'.repeat(offset - comment.split('\n').length + 1) + code;
const compiledPreview = align(
  compiled,
  '// Styles defined locally fold into a static className.',
);
const inlinePreview = align(
  inlined,
  '// Plumeria builds a module graph and resolves sx at build time.',
);

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
    '@media (max-width: 640px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
      padding: '56px 0',
    },
  },
  heroLogo: {
    display: 'flex',
    justifyContent: 'center',
    '@media (max-width: 640px)': {
      order: -1,
      zoom: 0.6,
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
  pipeline: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
    gap: 12,
    '@media (max-width: 900px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  arrow: {
    display: 'grid',
    placeItems: 'center',
    fontSize: 20,
    color: theme.faint,
    '@media (max-width: 900px)': {
      transform: 'rotate(90deg)',
    },
  },
  down: {
    padding: '12px 0',
    transform: 'rotate(90deg)',
  },
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
    backgroundColor: theme.bg,
    borderColor: theme.line,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 8,
  },
  window: {
    backgroundColor: '#1e1e1e',
    borderColor: '#2b2b2b',
  },
  bar: {
    fontFamily: 'var(--mono)',
    fontWeight: 400,
    color: '#9d9d9d',
    textTransform: 'none',
    letterSpacing: 0,
    backgroundColor: '#181818',
    borderBottomColor: '#2b2b2b',
  },
  cardHead: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    minHeight: 36,
    padding: '0 0 0 16px',
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
    color: theme.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottomColor: theme.line,
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
  },
  step: {
    display: 'grid',
    placeItems: 'center',
    width: 20,
    height: 20,
    fontSize: 12,
    color: theme.accentText,
    backgroundColor: theme.accentSoft,
    borderRadius: 999,
  },
  split: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)',
    gap: 64,
    alignItems: 'start',
    padding: '136px 0 0',
    '@media (max-width: 900px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: 32,
      padding: '88px 0 0',
    },
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
  tree: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: '4px 24px',
    maxWidth: '100%',
    margin: 0,
    overflowX: 'auto',
    fontFamily: 'var(--mono)',
    fontSize: 13,
    whiteSpace: 'pre',
  },
  row: {
    display: 'contents',
  },
  code: {
    flex: 1,
  },
  dim: {
    color: theme.faint,
  },
  weight: {
    color: theme.accentText,
  },
  equals: {
    padding: '2px 16px',
    fontFamily: 'var(--mono)',
    fontSize: 18,
    color: '#2dd4bf',
    backgroundColor: '#1e1e1e',
    borderTopColor: theme.line,
    borderTopStyle: 'solid',
    borderTopWidth: 1,
    borderBottomColor: theme.line,
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
  },
  stage: {
    display: 'grid',
    placeItems: 'center',
    padding: 28,
    backgroundColor: theme.bg,
    borderTopColor: theme.line,
    borderTopStyle: 'solid',
    borderTopWidth: 1,
  },
  box: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderRadius: 10,
  },
  content: {
    width: 140,
    height: 44,
    backgroundColor: theme.bg,
    borderRadius: 4,
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
    height: 44,
    padding: '0 20px',
    fontSize: 15,
    fontWeight: 600,
    color: theme.bg,
    textDecoration: 'none',
    backgroundColor: theme.accent,
    borderRadius: 8,
    ':hover': {
      opacity: 0.85,
    },
  },
  table: {
    width: '100%',
    fontFamily: 'var(--mono)',
    fontSize: 13,
    tableLayout: 'fixed',
    borderCollapse: 'collapse',
  },
  cell: {
    width: '50%',
    padding: '6px 12px',
    textAlign: 'left',
    borderBottomColor: theme.line,
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
  },
  packageLink: {
    color: 'inherit',
    textDecoration: 'none',
    ':hover': {
      color: theme.accentText,
      textDecoration: 'underline',
    },
  },
  counterpart: {
    borderLeftColor: theme.line,
    borderLeftStyle: 'solid',
    borderLeftWidth: 1,
  },
  closing: {
    display: 'grid',
    gap: 28,
    justifyItems: 'center',
    padding: '72px 24px',
    margin: '136px 0 0',
    textAlign: 'center',
    backgroundColor: theme.panel,
    borderColor: theme.line,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 24,
  },
  bundlers: {
    margin: 0,
    fontSize: 14,
    color: theme.muted,
  },
});

function Card({
  step,
  title,
  file,
  children,
}: {
  step?: number;
  title?: string;
  file?: string;
  children: ReactNode;
}) {
  return (
    <section sx={[styles.card, !!file && styles.window]}>
      <h2 sx={[styles.cardHead, !!file && styles.bar]}>
        {step && <span sx={styles.step}>{step}</span>}
        {title ?? file}
      </h2>
      {children}
    </section>
  );
}

function Code({ html }: { html: string }) {
  return <div sx={styles.code} dangerouslySetInnerHTML={{ __html: html }} />;
}

const relayed = source('demo/relay.tsx', 'relay');

export default async function Home() {
  const [write, compile, inline, relay, forward, backward] = await Promise.all([
    Promise.all([
      tokenize(written),
      tokenize(written.replace("'@typedcss/css'", "'@plumeria/core'")),
    ]),
    highlight(compiledPreview, 'tsx'),
    highlight(inlinePreview, 'tsx'),
    highlight(relayed, 'tsx', [
      'use(Theme)',
      '[styles.card, sx]',
      'wide ? styles.wide : styles.narrow',
    ]),
    highlight(sheet(RULES), 'css'),
    highlight(sheet([...RULES].reverse()), 'css'),
  ]);

  return (
    <>
      <SiteHeader />
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
                Type-safe atomic CSS-in-JS. Styles compile to class maps at
                build time and merge on the element, property by property.
              </p>
              <div sx={styles.start}>
                <CopyCommand command="npx @typedcss/init" />
                <Link href="/docs" {...css.props(styles.getStarted)}>
                  Get Started
                </Link>
              </div>
            </div>
            <div sx={styles.heroLogo}>
              <Logo size={320} />
            </div>
          </section>

          <ImportAnimation variants={write}>
            <div sx={styles.pipeline}>
              <Card step={1} file="styles.tsx">
                <Editor />
              </Card>
              <div sx={styles.arrow} aria-hidden>
                →
              </div>
              <Card step={2} file="styles.jsx">
                <CompiledCode typedcss={compile} plumeria={inline} />
              </Card>
            </div>
          </ImportAnimation>
          <div sx={[styles.arrow, styles.down]} aria-hidden>
            →
          </div>
          <Card step={3} title="Resolve">
            <Merge />
          </Card>

          <section sx={styles.split}>
            <div>
              <h2 sx={styles.heading}>
                Order of the array. Not of the stylesheet.
              </h2>
              <p sx={styles.text}>
                A longhand beats its shorthand and a condition beats its base,
                ranked by the property graph TypedCSS shares with Plumeria. Each
                step adds one <code>:not(#\#)</code>, so rules can arrive in any
                order.
              </p>
              <div sx={styles.tree}>
                {TREE.map(([node, depth, used]) => (
                  <span key={node} sx={[styles.row, !used && styles.dim]}>
                    <span>{node}</span>
                    <span sx={used && styles.weight}>
                      {':not(#\\#)'.repeat(depth)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <Card file="styles.css">
              <Code html={forward} />
              <div sx={styles.equals}>=</div>
              <Code html={backward} />
              <div sx={styles.stage}>
                <div sx={[styles.box, graph.box]}>
                  <div sx={styles.content} />
                </div>
              </div>
            </Card>
          </section>

          <section sx={styles.split}>
            <div>
              <h2 sx={styles.heading}>Anywhere a value can go.</h2>
              <p sx={styles.text}>
                Props, context, variables, other packages. A style merges where
                it lands, any number of hops later.
              </p>
            </div>
            <Card file="Card.tsx">
              <Code html={relay} />
            </Card>
          </section>

          <section sx={styles.split}>
            <div>
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
            <table sx={styles.table}>
              <tbody>
                {PACKAGES.map(([typedcss, plumeria]) => (
                  <tr key={typedcss}>
                    <td sx={styles.cell}>
                      <a
                        href={`https://www.npmjs.com/package/${typedcss}`}
                        sx={styles.packageLink}
                      >
                        {typedcss}
                      </a>
                    </td>
                    <td sx={[styles.cell, styles.counterpart]}>
                      <a
                        href={`https://www.npmjs.com/package/${plumeria}`}
                        sx={styles.packageLink}
                      >
                        {plumeria}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section sx={styles.closing}>
            <h2 sx={styles.heading}>It shows the plan, then writes.</h2>
            <CopyCommand command="npx @typedcss/init" />
            <p sx={styles.bundlers}>
              Next.js · Vite · Astro · webpack · Rspack · Rollup · Rolldown ·
              esbuild · Farm · Bun
            </p>
          </section>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
