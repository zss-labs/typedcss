'use client';

import * as css from '@typedcss/css';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, ViewTransition } from 'react';
import { OPEN_SEARCH } from './Search';
import { bp, docs } from './theme';

const wobble = css.keyframes({
  '20%': {
    inset: '3.5px -1.6vw',
    backgroundColor: docs.docAccent,
    borderRadius: '13px 64px 64px 13px / 13px',
    boxShadow:
      'inset 0 1px 1px rgb(255 255 255 / 0.2), inset 0 -1px 1px rgb(0 0 0 / 0.08)',
    transform: 'translateX(1vw)',
  },
  '46%': {
    inset: '-1.5px 3%',
    borderRadius: '17px',
    transform: 'translateX(0)',
  },
  '72%': {
    inset: '0.5px -0.6%',
  },
});

const dim = css.keyframes({
  '20%': {
    opacity: 0.4,
  },
  '55%': {
    opacity: 1,
  },
});

const motion = css.createStatic({
  animationDuration: '0.45s',
  animationTimingFunction:
    'linear(0, 0.037, 0.126, 0.243, 0.371, 0.497, 0.613, 0.714, 0.8, 0.869, 0.922, 0.962, 0.991, 1.01, 1.022, 1.028, 1.03, 1.03, 1.027, 1.024, 1.02, 1.016, 1.013, 1.01, 1.007, 1.005, 1.003, 1.002, 1.001, 1, 1)',
} satisfies css.CSSProperties);

const droplet = css.viewTransitionClass({
  group: {
    ...motion,
  },
  imagePair: {
    backgroundColor: `color-mix(in oklab, ${docs.docAccent} 50%, transparent)`,
    borderRadius: 17,
    animationName: wobble,
    animationTimingFunction: 'cubic-bezier(0.37, 0, 0.63, 1)',
  },
  old: {
    display: 'none',
  },
  new: {
    display: 'none',
  },
});

const dropletBack = css.viewTransitionClass({
  group: {
    ...motion,
  },
  imagePair: {
    backgroundColor: `color-mix(in oklab, ${docs.docAccent} 50%, transparent)`,
    borderRadius: 17,
    scale: '-1 1',
    animationName: wobble,
    animationTimingFunction: 'cubic-bezier(0.37, 0, 0.63, 1)',
  },
  old: {
    display: 'none',
  },
  new: {
    display: 'none',
  },
});

const carried = css.viewTransitionClass({
  group: {
    ...motion,
  },
  imagePair: {
    animationName: dim,
    animationTimingFunction: 'cubic-bezier(0.37, 0, 0.63, 1)',
  },
});

const canAnimate = () => window.matchMedia('(min-width: 768.02px)').matches;

const styles = css.create({
  trigger: {
    display: 'inline-flex',
    gap: 4,
    alignItems: 'center',
    padding: '4px 10px',
    fontSize: 12,
    color: docs.docMuted,
    cursor: 'pointer',
    background: `color-mix(in oklab, ${docs.docAccent} 50%, transparent)`,
    borderWidth: 0,
    borderRadius: 9999,
    transitionDuration: '0.2s',
    transitionProperty: 'color, background-color',
    ':hover': {
      color: docs.docFg,
      background: docs.docAccent,
    },
    [bp.md]: {
      display: 'none',
    },
  },
  centered: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    justifyContent: 'space-between',
    width: 'clamp(120px, 100vw - 760px, 280px)',
    padding: '6px 12px',
    transform: 'translate(-50%, -50%)',
  },
  kbd: {
    fontFamily: 'inherit',
  },
});

export function SearchTrigger() {
  const isDocs = usePathname().startsWith('/docs');
  const wasDocs = useRef(isDocs);
  const moved = isDocs !== wasDocs.current && canAnimate();

  useEffect(() => {
    wasDocs.current = isDocs;
  }, [isDocs]);

  return (
    <ViewTransition
      default="none"
      update={moved ? (isDocs ? droplet : dropletBack) : 'none'}
    >
      <button
        type="button"
        aria-label="Search"
        sx={[styles.trigger, isDocs && styles.centered]}
        onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH))}
      >
        <ViewTransition default="none" update={moved ? carried : 'none'}>
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
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <kbd sx={styles.kbd}>⌘K</kbd>
        </ViewTransition>
      </button>
    </ViewTransition>
  );
}
