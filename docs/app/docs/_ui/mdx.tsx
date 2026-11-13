import * as css from '@typedcss/css';
import Link from 'next/link';
import { isValidElement, type ComponentProps, type ReactNode } from 'react';
import type { MDXComponents } from 'mdx/types';
import { CopyCode } from './CopyButton';
import { bp, docs } from './theme';

const styles = css.create({
  heading: {
    display: 'flex',
    alignItems: 'center',
    color: docs.docFg,
    scrollMarginTop: 112,
  },
  h2: {
    margin: '42px 0 21px',
    fontSize: 21,
    fontWeight: 600,
    lineHeight: '28px',
  },
  h3: {
    margin: '28px 0 10.5px',
    fontSize: 17.5,
    fontWeight: 600,
    lineHeight: '28px',
  },
  h4: {
    margin: '24px 0 8px',
    fontSize: 14,
    fontWeight: 600,
  },
  anchor: {
    color: 'inherit',
    textDecoration: 'none',
  },
  p: {
    margin: '0 0 17.5px',
  },
  a: {
    fontWeight: 500,
    color: docs.docFg,
    textDecorationThickness: 1,
    textDecorationColor: docs.docPrimary,
    textUnderlineOffset: 5,
  },
  strong: {
    fontWeight: 600,
    color: docs.docStrong,
  },
  code: {
    padding: 3,
    fontFamily: 'var(--mono)',
    fontSize: 12,
    color: docs.docFg,
    background: docs.docCode,
    borderColor: docs.docBorder,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 5,
  },
  list: {
    paddingLeft: 22,
    margin: '0 0 17.5px',
  },
  li: {
    paddingLeft: 6,
    margin: '7px 0',
    '::marker': {
      color: docs.docLabel,
    },
  },
  blockquote: {
    paddingLeft: 16,
    margin: '0 0 17.5px',
    fontStyle: 'italic',
    borderLeftColor: docs.docBorder,
    borderLeftStyle: 'solid',
    borderLeftWidth: 2,
  },
  img: {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    margin: '24px 0',
  },
  hr: {
    margin: '42px 0',
    borderColor: docs.docBorder,
    borderStyle: 'solid',
    borderWidth: '1px 0 0',
  },
  tableWrap: {
    margin: '24px 0',
    overflowX: 'auto',
    borderColor: docs.docBorder,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 12,
  },
  table: {
    width: '100%',
    fontSize: 13,
    borderCollapse: 'collapse',
  },
  th: {
    padding: '8px 12px',
    fontWeight: 600,
    color: docs.docFg,
    textAlign: 'left',
    background: docs.docCode,
    borderBottomColor: docs.docBorder,
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
  },
  td: {
    padding: '8px 12px',
    borderBottomColor: docs.docBorder,
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    ':is(tr:last-child > *)': {
      borderBottomWidth: 0,
    },
    ':first-child': {
      whiteSpace: 'nowrap',
    },
  },
  figure: {
    position: 'relative',
    margin: '16px 0',
    overflow: 'hidden',
    fontSize: 14,
    colorScheme: 'dark',
    background: 'rgb(12, 12, 14)',
    borderColor: 'rgba(255, 255, 255, 0.07)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 12,
  },
  caption: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    height: 38,
    padding: '0 8px 0 16px',
    color: 'rgba(179, 179, 179, 0.8)',
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
  },
  captionTitle: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pre: {
    padding: '16px 12px',
    margin: 0,
    overflowX: 'auto',
    fontFamily: 'var(--mono)',
    fontSize: 12,
    lineHeight: 1.75,
    color: '#e0dfe1',
    tabSize: 2,
    [bp.md]: {
      fontSize: 11,
    },
  },
});

const ShellIcon = () => (
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
    <path d="m4 17 6-6-6-6M12 19h8" />
  </svg>
);

const FileIcon = () => (
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
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v5h6" />
  </svg>
);

const SHELL = /^(sh|bash|shell|zsh|console)$/;

type PreProps = ComponentProps<'pre'> & {
  title?: string;
  'data-language'?: string;
  icon?: string;
};

function Pre({ title, children, ...props }: PreProps) {
  const language = props['data-language'] ?? '';
  // Shiki colors each token inline; the inner code element would otherwise take the inline code style.
  const lines = isValidElement<{ children?: ReactNode }>(children)
    ? children.props.children
    : children;
  const caption = title ?? (SHELL.test(language) ? 'Terminal' : undefined);

  return (
    <figure sx={styles.figure}>
      {caption ? (
        <figcaption sx={styles.caption}>
          {SHELL.test(language) ? <ShellIcon /> : <FileIcon />}
          <span sx={styles.captionTitle}>{caption}</span>
          <CopyCode />
        </figcaption>
      ) : (
        <CopyCode floating />
      )}
      <pre sx={styles.pre}>
        <code>{lines}</code>
      </pre>
    </figure>
  );
}

const heading = (level: 'h2' | 'h3' | 'h4') =>
  function Heading({ id, children }: { id?: string; children?: ReactNode }) {
    const Tag = level;
    return (
      <Tag id={id} sx={[styles.heading, styles[level]]}>
        {id ? (
          <a href={`#${id}`} sx={styles.anchor}>
            {children}
          </a>
        ) : (
          children
        )}
      </Tag>
    );
  };

function Anchor({ href = '', children }: ComponentProps<'a'>) {
  if (href.startsWith('/') || href.startsWith('#')) {
    return (
      <Link href={href} {...css.props(styles.a)}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" sx={styles.a}>
      {children}
    </a>
  );
}

export const mdxComponents: MDXComponents = {
  h2: heading('h2'),
  h3: heading('h3'),
  h4: heading('h4'),
  p: ({ children }) => <p sx={styles.p}>{children}</p>,
  a: Anchor,
  strong: ({ children }) => <strong sx={styles.strong}>{children}</strong>,
  code: ({ children }) => <code sx={styles.code}>{children}</code>,
  pre: Pre,
  ul: ({ children }) => <ul sx={styles.list}>{children}</ul>,
  ol: ({ children, start }) => (
    <ol start={start} sx={styles.list}>
      {children}
    </ol>
  ),
  li: ({ children }) => <li sx={styles.li}>{children}</li>,
  blockquote: ({ children }) => (
    <blockquote sx={styles.blockquote}>{children}</blockquote>
  ),
  img: ({ src, alt, width, height }) => {
    const image =
      typeof src === 'object'
        ? (src as { src: string; width: number; height: number })
        : null;
    return (
      <img
        src={image ? image.src : src}
        alt={alt}
        width={image ? image.width : width}
        height={image ? image.height : height}
        sx={styles.img}
      />
    );
  },
  hr: () => <hr sx={styles.hr} />,
  table: ({ children }) => (
    <div sx={styles.tableWrap}>
      <table sx={styles.table}>{children}</table>
    </div>
  ),
  th: ({ children }) => <th sx={styles.th}>{children}</th>,
  td: ({ children }) => <td sx={styles.td}>{children}</td>,
};
