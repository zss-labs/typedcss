'use client';

import * as css from '@typedcss/css';
import Link from 'next/link';
import { Fragment, useEffect, useMemo, useRef } from 'react';
import { useDocsSearch } from 'fumadocs-core/search/client';
import type { SortedResult } from 'fumadocs-core/search';
import { bp, docs } from './theme';

const styles = css.create({
  trigger: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 'clamp(120px, 100vw - 760px, 280px)',
    padding: '6px 12px',
    fontSize: 12,
    color: docs.docMuted,
    cursor: 'pointer',
    background: `color-mix(in oklab, ${docs.docAccent} 50%, transparent)`,
    borderWidth: 0,
    borderRadius: 9999,
    transform: 'translate(-50%, -50%)',
    transitionDuration: '0.2s',
    transitionProperty: 'color, background-color',
    ':hover': {
      color: docs.docFg,
      background: docs.docAccent,
    },
    [bp.md]: {
      position: 'static',
      width: 'auto',
      padding: 6,
      marginLeft: 'auto',
      background: 'none',
      transform: 'none',
    },
  },
  kbd: {
    fontFamily: 'inherit',
    [bp.md]: {
      display: 'none',
    },
  },
  dialog: {
    width: 'min(640px, 100vw - 32px)',
    maxHeight: 'min(480px, 100dvh - 96px)',
    padding: 0,
    marginTop: 96,
    overflow: 'hidden',
    color: docs.docFg,
    background: docs.docBg,
    borderColor: docs.docBorder,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 16,
    '[open]': {
      display: 'flex',
      flexDirection: 'column',
    },
    '::backdrop': {
      background: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(2px)',
    },
  },
  field: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    padding: '0 16px',
    color: docs.docMuted,
    borderBottomColor: docs.docBorder,
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
  },
  input: {
    flex: 1,
    height: 52,
    fontFamily: 'inherit',
    fontSize: 15,
    color: docs.docFg,
    outline: 'none',
    background: 'none',
    borderWidth: 0,
  },
  list: {
    padding: 8,
    margin: 0,
    overflowY: 'auto',
    listStyle: 'none',
  },
  result: {
    display: 'block',
    padding: '8px 12px',
    fontSize: 14,
    color: docs.docMuted,
    textDecoration: 'none',
    borderRadius: 8,
    ':is(:hover, :focus-visible)': {
      color: docs.docFg,
      outline: 'none',
      background: docs.docAccent,
    },
  },
  page: {
    fontWeight: 500,
    color: docs.docFg,
  },
  nested: {
    paddingLeft: 28,
  },
  breadcrumbs: {
    display: 'flex',
    gap: 2,
    alignItems: 'center',
    fontSize: 12,
    fontWeight: 400,
    color: docs.docMuted,
  },
  empty: {
    padding: '24px 12px',
    fontSize: 14,
    color: docs.docMuted,
    textAlign: 'center',
  },
});

const SearchIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const strip = (text: string) => text.replace(/<[^>]*>/g, '');

const Chevron = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const withPageBreadcrumbs = (items: SortedResult[]) => {
  let page: SortedResult | undefined;
  return items
    .filter((item) => item.type !== 'text')
    .map((item) => {
      if (item.type === 'page') {
        page = item;
        return item;
      }
      return {
        ...item,
        breadcrumbs: page
          ? [...(page.breadcrumbs ?? []), strip(page.content as string)]
          : item.breadcrumbs,
      };
    });
};

// Pages whose title holds the query come first, each tier in sidebar order.
const sortBySidebar = (items: SortedResult[], query: string) => {
  const groups: SortedResult[][] = [];
  for (const item of items) {
    if (item.type === 'page' || groups.length === 0) groups.push([]);
    groups.at(-1)!.push(item);
  }

  const rank = ([page]: SortedResult[]) =>
    (strip(page.content as string)
      .toLowerCase()
      .includes(query.toLowerCase())
      ? 0
      : 1e6) + parseInt(page.id);

  return groups.sort((a, b) => rank(a) - rank(b)).flat();
};

export function Search() {
  const dialog = useRef<HTMLDialogElement>(null);
  const { search, setSearch, query } = useDocsSearch({
    type: 'static',
    from: '/api/search',
  });

  const open = () => {
    dialog.current?.showModal();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(
    () =>
      query.data === 'empty'
        ? []
        : sortBySidebar(withPageBreadcrumbs(query.data ?? []), search),
    [query.data, search],
  );

  return (
    <>
      <button
        type="button"
        aria-label="Search"
        sx={styles.trigger}
        onClick={open}
      >
        <SearchIcon />
        <kbd sx={styles.kbd}>⌘K</kbd>
      </button>
      <dialog
        ref={dialog}
        sx={styles.dialog}
        aria-label="Search"
        onClick={(event) =>
          event.target === event.currentTarget && dialog.current?.close()
        }
      >
        <label sx={styles.field}>
          <SearchIcon />
          <input
            type="search"
            value={search}
            placeholder="Search"
            autoFocus
            sx={styles.input}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {search && (
          <ul sx={styles.list}>
            {results.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.url}
                  {...css.props(
                    styles.result,
                    item.type === 'page' ? styles.page : styles.nested,
                  )}
                  onClick={() => dialog.current?.close()}
                >
                  {item.breadcrumbs && item.breadcrumbs.length > 0 && (
                    <span sx={styles.breadcrumbs}>
                      {item.breadcrumbs.map((crumb, index) => (
                        <Fragment key={index}>
                          {index > 0 && <Chevron />}
                          {crumb}
                        </Fragment>
                      ))}
                    </span>
                  )}
                  {strip(item.content as string)}
                </Link>
              </li>
            ))}
            {!query.isLoading && results.length === 0 && (
              <li sx={styles.empty}>No results</li>
            )}
          </ul>
        )}
      </dialog>
    </>
  );
}
