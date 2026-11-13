import * as css from '@typedcss/css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findNeighbour, type Node } from 'fumadocs-core/page-tree';
import { source } from '@/lib/source';
import { CopyPage } from '../_ui/CopyButton';
import { mdxComponents } from '../_ui/mdx';
import { SiteFooter } from '../_ui/SiteFooter';
import { Toc } from '../_ui/Toc';
import { bp, docs } from '../_ui/theme';

const styles = css.create({
  article: {
    gridRow: 1,
    gridColumn: 2,
    width: '100%',
    maxWidth: 696,
    padding: '56px 32px 24px',
    marginInline: 'auto 0',
    [bp.lg]: {
      marginInline: 'auto',
    },
    [bp.md]: {
      padding: '32px 16px 24px',
    },
  },
  header: {
    marginBottom: 24,
  },
  section: {
    margin: '0 0 10px',
    fontSize: 11,
    fontWeight: 600,
    color: docs.docLabel,
    letterSpacing: '0.06em',
  },
  titleRow: {
    display: 'flex',
    gap: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
    [bp.md]: {
      flexDirection: 'column',
      gap: 16,
      alignItems: 'flex-start',
    },
  },
  title: {
    minWidth: 0,
    margin: 0,
    fontSize: 30,
    fontWeight: 500,
    lineHeight: '36px',
    letterSpacing: '-0.025em',
    overflowWrap: 'anywhere',
  },
  description: {
    margin: '16px 0 0',
    fontSize: 16,
    fontWeight: 320,
    lineHeight: 1.6,
    color: docs.docProse,
  },
  body: {
    fontSize: 14,
    fontWeight: 320,
    lineHeight: 1.75,
    color: docs.docProse,
  },
  edit: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    marginTop: 32,
    fontSize: 12,
    fontWeight: 500,
    color: docs.docFg,
    textDecoration: 'none',
    background: docs.docAccent,
    borderColor: docs.docBorder,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 6,
    transitionDuration: '0.2s',
    ':hover': {
      opacity: 0.8,
    },
  },
  neighbours: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    marginTop: 24,
    [bp.md]: {
      gridTemplateColumns: '1fr',
    },
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 0,
    padding: 16,
    fontSize: 14,
    color: docs.docFg,
    textDecoration: 'none',
    borderColor: docs.docBorder,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 8,
    transitionDuration: '0.2s',
    transitionProperty: 'background-color',
    ':hover': {
      background: `color-mix(in oklab, ${docs.docAccent} 40%, transparent)`,
    },
  },
  next: {
    gridColumn: 2,
    alignItems: 'flex-end',
    textAlign: 'right',
    [bp.md]: {
      gridColumn: 1,
    },
  },
  cardTitle: {
    display: 'inline-flex',
    gap: 4,
    alignItems: 'center',
    fontWeight: 500,
  },
  cardDescription: {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: docs.docMuted,
    whiteSpace: 'nowrap',
  },
});

const getSection = (
  nodes: Node[],
  url: string,
  section = '',
): string | undefined => {
  let current = section;
  for (const node of nodes) {
    if (node.type === 'separator' && typeof node.name === 'string')
      current = node.name;
    if (node.type === 'page' && node.url === url) return current;
    if (node.type === 'folder') {
      if (node.index?.url === url) return current;
      const found = getSection(node.children, url, current);
      if (found !== undefined) return found;
    }
  }
};

const Chevron = ({ d }: { d: string }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

type Props = { params: Promise<{ slug?: string[] }> };

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const tree = source.getPageTree();
  const MDX = page.data.body;
  const markdown = await page.data.getText('processed');
  const section = getSection(tree.children, page.url);
  const { previous, next } = findNeighbour(tree, page.url);
  const describe = (url: string) =>
    source.getPages().find((item) => item.url === url)?.data.description;

  return (
    <>
      <article sx={styles.article}>
        <header sx={styles.header}>
          {section && <p sx={styles.section}>{section}</p>}
          <div sx={styles.titleRow}>
            <h1 sx={styles.title}>{page.data.title}</h1>
            <CopyPage markdown={`# ${page.data.title}\n\n${markdown}`} />
          </div>
          {page.data.description && (
            <p sx={styles.description}>{page.data.description}</p>
          )}
        </header>
        <div sx={styles.body}>
          <MDX components={mdxComponents} />
        </div>
        <a
          href={`https://github.com/zss-labs/typedcss/blob/main/docs/content/docs/${page.path}`}
          target="_blank"
          rel="noreferrer noopener"
          sx={styles.edit}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9M16.38 3.62a2.12 2.12 0 1 1 3 3L7.37 18.64 3 20l1.36-4.37Z" />
          </svg>
          Edit on GitHub
        </a>
        <nav aria-label="Pagination" sx={styles.neighbours}>
          {previous && (
            <Link href={previous.url} {...css.props(styles.card)}>
              <span sx={styles.cardTitle}>
                <Chevron d="m15 18-6-6 6-6" />
                {previous.name}
              </span>
              <span sx={styles.cardDescription}>{describe(previous.url)}</span>
            </Link>
          )}
          {next && (
            <Link href={next.url} {...css.props(styles.card, styles.next)}>
              <span sx={styles.cardTitle}>
                {next.name}
                <Chevron d="m9 18 6-6-6-6" />
              </span>
              <span sx={styles.cardDescription}>{describe(next.url)}</span>
            </Link>
          )}
        </nav>
        <SiteFooter />
      </article>
      <Toc toc={page.data.toc} />
    </>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return {
    title: `${page.data.title} | TypedCSS`,
    description: page.data.description,
    alternates: { canonical: page.url },
    openGraph: {
      images: `/api/ogp/${[...page.slugs, 'og.png'].join('/')}`,
    },
  };
}
