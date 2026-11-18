'use client';

import { theme } from '../theme';

import { useState } from 'react';
import * as css from '@typedcss/css';

const RUN =
  'https://github.com/refirst11/css-compiler-bench/actions/runs/43859705918';

const CHARTS = [
  {
    title: 'Next.js production build',
    unit: 'Seconds, median of 26 builds (lower is better)',
    max: 7,
    step: 1,
    rows: [
      { label: 'TypedCSS', value: 4.6 },
      { label: 'StyleX (SWC)', value: 6.0 },
      { label: 'StyleX (Babel)', value: 6.34 },
    ],
  },
  {
    title: '1,000 style definitions',
    unit: 'Seconds, same app scaled up (lower is better)',
    max: 12,
    step: 2,
    rows: [
      { label: 'TypedCSS', value: 7.19 },
      { label: 'StyleX (SWC)', value: 8.76 },
      { label: 'StyleX (Babel)', value: 11.74 },
    ],
  },
] as const;

const styles = css.create({
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 6fr) minmax(0, 5fr)',
    gap: 64,
    alignItems: 'center',
    '@media (max-width: 900px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: 40,
    },
  },
  chart: {
    position: 'relative',
    display: 'grid',
    gap: 28,
    padding: '28px 32px 22px',
    margin: 0,
    backgroundColor: theme.panel,
    borderColor: theme.line,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 12,
    '@media (max-width: 640px)': {
      padding: '24px 18px 18px',
    },
  },
  head: {
    display: 'grid',
    gap: 6,
    padding: '0 40px',
    textAlign: 'center',
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  unit: {
    fontSize: 13,
    color: theme.muted,
  },
  toggle: {
    position: 'absolute',
    top: 16,
    right: 16,
    display: 'grid',
    placeItems: 'center',
    width: 32,
    height: 32,
    padding: 0,
    fontSize: 16,
    color: theme.accentText,
    cursor: 'pointer',
    backgroundColor: theme.accentSoft,
    borderWidth: 0,
    borderRadius: 8,
    ':hover': {
      opacity: 0.8,
    },
  },
  body: {
    display: 'grid',
    gridTemplateColumns: 'max-content minmax(0, 1fr)',
    columnGap: 14,
  },
  labels: {
    display: 'grid',
    gridAutoRows: '48px',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    color: theme.muted,
    textAlign: 'right',
  },
  winner: {
    fontWeight: 600,
    color: theme.fg,
  },
  plot: {
    position: 'relative',
    display: 'grid',
    gridAutoRows: '48px',
    alignItems: 'center',
    borderBottomColor: theme.faint,
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    borderLeftColor: theme.faint,
    borderLeftStyle: 'solid',
    borderLeftWidth: 1,
  },
  gridLine: {
    display: 'block',
    width: 1,
    height: '100%',
    backgroundColor: theme.line,
  },
  row: {
    position: 'relative',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  bar: {
    display: 'block',
    height: 24,
    backgroundColor: theme.faint,
    borderRadius: '0 4px 4px 0',
  },
  lead: {
    backgroundColor: theme.accent,
  },
  value: {
    fontFamily: 'var(--mono)',
    fontSize: 12,
    color: theme.muted,
    whiteSpace: 'nowrap',
  },
  axis: {
    position: 'relative',
    gridColumn: 2,
    height: 22,
  },
  tick: {
    display: 'block',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    color: theme.faint,
    transform: 'translateX(-50%)',
  },
  source: {
    fontSize: 12,
    color: theme.faint,
    textAlign: 'center',
  },
  link: {
    color: theme.muted,
    textDecorationLine: 'underline',
    textUnderlineOffset: 2,
  },
  heading: {
    margin: 0,
    fontSize: 'clamp(30px, 4.2vw, 44px)',
    fontWeight: 800,
    lineHeight: 1.08,
    letterSpacing: '-0.035em',
  },
  stats: {
    display: 'grid',
    marginTop: 28,
  },
  stat: {
    display: 'grid',
    gridTemplateColumns: '48px 1fr',
    gap: 16,
    alignItems: 'center',
    padding: '18px 0',
    borderTopColor: theme.line,
    borderTopStyle: 'solid',
    borderTopWidth: 1,
    ':first-child': {
      borderTopWidth: 0,
    },
  },
  icon: {
    display: 'grid',
    placeItems: 'center',
    width: 48,
    height: 48,
    color: theme.accentText,
    backgroundColor: theme.accentSoft,
    borderRadius: 999,
  },
  statTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    color: theme.accentText,
  },
  statText: {
    margin: '4px 0 0',
    fontSize: 14,
    color: theme.muted,
  },
});

const at = (value: number, max: number) => `${(value / max) * 100}%`;

function Bolt() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Bars() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20V10m6 10V4m6 16v-7M3 20h18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Bench() {
  const [index, setIndex] = useState(0);
  const chart = CHARTS[index];
  const ticks = Array.from(
    { length: chart.max / chart.step + 1 },
    (_, tick) => tick * chart.step,
  );

  return (
    <div sx={styles.layout}>
      <figure sx={styles.chart}>
        <div sx={styles.head}>
          <h3 sx={styles.title}>{chart.title}</h3>
          <span sx={styles.unit}>{chart.unit}</span>
        </div>
        <button
          type="button"
          aria-label="Switch chart"
          onClick={() => setIndex((index + 1) % CHARTS.length)}
          sx={styles.toggle}
        >
          ⇄
        </button>
        <div sx={styles.body}>
          <div sx={styles.labels}>
            {chart.rows.map((row, rank) => (
              <span
                key={row.label}
                sx={[styles.label, rank === 0 && styles.winner]}
              >
                {row.label}
              </span>
            ))}
          </div>
          <div sx={styles.plot}>
            {ticks.slice(1).map((tick) => (
              <span
                key={tick}
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: at(tick, chart.max),
                }}
              >
                <span sx={styles.gridLine} />
              </span>
            ))}
            {chart.rows.map((row, rank) => (
              <div key={row.label} sx={styles.row}>
                <span
                  style={{
                    width: at(row.value, chart.max),
                    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  <span sx={[styles.bar, rank === 0 && styles.lead]} />
                </span>
                <span sx={styles.value}>{row.value.toFixed(2)}s</span>
              </div>
            ))}
          </div>
          <div sx={styles.axis} aria-hidden>
            {ticks.map((tick) => (
              <span
                key={tick}
                style={{
                  position: 'absolute',
                  top: 6,
                  left: at(tick, chart.max),
                }}
              >
                <span sx={styles.tick}>{tick}</span>
              </span>
            ))}
          </div>
        </div>
        <figcaption sx={styles.source}>
          Based on{' '}
          <a href={RUN} sx={styles.link}>
            css-compiler-bench
          </a>{' '}
          (GitHub Actions, 4 vCPU)
        </figcaption>
      </figure>
      <div>
        <h2 sx={styles.heading}>Builds faster than StyleX.</h2>
        <div sx={styles.stats}>
          <div sx={styles.stat}>
            <span sx={styles.icon}>
              <Bolt />
            </span>
            <div>
              <h3 sx={styles.statTitle}>6× less build overhead.</h3>
              <p sx={styles.statText}>
                Against StyleX with its SWC plugin, on the same Next.js app.
              </p>
            </div>
          </div>
          <div sx={styles.stat}>
            <span sx={styles.icon}>
              <Bars />
            </span>
            <div>
              <h3 sx={styles.statTitle}>1,000 definitions in 7.19s.</h3>
              <p sx={styles.statText}>
                StyleX takes 8.76s with SWC and 11.74s with Babel.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
