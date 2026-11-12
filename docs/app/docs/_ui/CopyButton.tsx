'use client';

import * as css from '@typedcss/css';
import { useRef, useState, type ReactNode } from 'react';
import { docs } from './theme';

const styles = css.create({
  page: {
    display: 'inline-flex',
    flexShrink: 0,
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    padding: '6px 12px',
    fontFamily: 'inherit',
    fontSize: 14,
    color: docs.docMuted,
    cursor: 'pointer',
    background: 'transparent',
    borderColor: docs.docBorder,
    borderStyle: 'solid',
    borderWidth: 1,
    ':hover': {
      background: docs.docAccent,
    },
  },
  code: {
    display: 'inline-flex',
    padding: 6,
    color: 'rgba(179, 179, 179, 0.8)',
    cursor: 'pointer',
    background: 'none',
    borderWidth: 0,
    borderRadius: 6,
    ':hover': {
      color: '#fafafa',
      background: 'rgba(255, 255, 255, 0.08)',
    },
  },
  floating: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
  },
});

const CopyIcon = ({ done }: { done: boolean }) => (
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
    {done ? (
      <path d="M20 6 9 17l-5-5" />
    ) : (
      <>
        <rect x="8" y="8" width="14" height="14" rx="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </>
    )}
  </svg>
);

const useCopied = () => {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setDone(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1500);
  };
  return [done, copy] as const;
};

export function CopyPage({ markdown }: { markdown: string }) {
  const [done, copy] = useCopied();
  return (
    <button type="button" sx={styles.page} onClick={() => copy(markdown)}>
      <CopyIcon done={done} />
      Copy page
    </button>
  );
}

export function CopyCode({
  floating,
  children,
}: {
  floating?: boolean;
  children?: ReactNode;
}) {
  const [done, copy] = useCopied();
  return (
    <button
      type="button"
      aria-label="Copy code"
      sx={[styles.code, floating && styles.floating]}
      onClick={(event) => {
        const pre = event.currentTarget.closest('figure')?.querySelector('pre');
        if (pre) copy(pre.textContent ?? '');
      }}
    >
      <CopyIcon done={done} />
      {children}
    </button>
  );
}
