'use client';

import { theme } from '../theme';

import { Fragment, useState } from 'react';
import * as css from '@typedcss/css';
import { styles as demo } from './styles';

const SOURCES = {
  base: demo.base,
  pill: demo.pill,
  sky: demo.sky,
};

type Name = keyof typeof SOURCES;

const classOf = (name: Name, property: string) =>
  (SOURCES[name] as Record<string, string | undefined>)[property];

const PROPERTIES = [
  ...new Set(Object.values(SOURCES).flatMap((map) => Object.keys(map))),
].filter((property) => property !== '$$css');

const styles = css.create({
  root: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 3fr)',
    '@media (max-width: 900px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  pane: {
    padding: '12px 16px',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    minWidth: 440,
    fontFamily: 'var(--mono)',
    fontSize: 12,
    borderCollapse: 'collapse',
  },
  call: {
    padding: '0 0 14px',
    fontWeight: 400,
    color: theme.muted,
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },
  chip: {
    display: 'inline-flex',
    gap: 6,
    alignItems: 'center',
    padding: '4px 8px',
    font: 'inherit',
    color: theme.fg,
    cursor: 'pointer',
    backgroundColor: theme.bg,
    borderColor: theme.line,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 5,
    ':hover': {
      borderColor: theme.accent,
    },
  },
  last: {
    cursor: 'default',
    ':hover': {
      borderColor: theme.line,
    },
  },
  arrow: {
    color: theme.accentText,
  },
  property: {
    padding: '8px 12px 8px 0',
    fontWeight: 400,
    color: theme.muted,
    textAlign: 'left',
    whiteSpace: 'nowrap',
    borderTopColor: theme.line,
    borderTopStyle: 'solid',
    borderTopWidth: 1,
  },
  cell: {
    padding: '8px 0 8px 8px',
    borderTopColor: theme.line,
    borderTopStyle: 'solid',
    borderTopWidth: 1,
  },
  atom: {
    borderRadius: 4,
  },
  win: {
    color: theme.accentText,
    backgroundColor: theme.accentSoft,
    boxShadow: '0 0 0 2px var(--accent-soft)',
  },
  outputAtom: {
    color: '#5eead4',
    backgroundColor: 'rgba(45, 212, 191, 0.14)',
    boxShadow: '0 0 0 2px rgba(45, 212, 191, 0.14)',
  },
  lose: {
    color: theme.faint,
    textDecorationLine: 'line-through',
  },
  none: {
    color: theme.faint,
  },
  result: {
    display: 'flex',
    flexDirection: 'column',
    borderLeftColor: theme.line,
    borderLeftStyle: 'solid',
    borderLeftWidth: 1,
    '@media (max-width: 900px)': {
      borderTopColor: theme.line,
      borderTopStyle: 'solid',
      borderTopWidth: 1,
      borderLeftWidth: 0,
    },
  },
  output: {
    padding: '12px 16px',
    margin: 0,
    fontFamily: 'var(--mono)',
    fontSize: 12,
    lineHeight: 1.6,
    color: '#d4d4d4',
    whiteSpace: 'pre-wrap',
    backgroundColor: '#1e1e1e',
  },
  stage: {
    display: 'grid',
    flex: 1,
    placeItems: 'center',
    minHeight: 100,
    backgroundColor: theme.panel,
    borderTopColor: theme.line,
    borderTopStyle: 'solid',
    borderTopWidth: 1,
  },
});

export function Merge() {
  const [order, setOrder] = useState<Name[]>(['base', 'pill', 'sky']);
  const merged = css.props(order.map((name) => SOURCES[name]));
  const classes = merged.className?.split(' ') ?? [];

  const moveRight = (index: number) => {
    if (index === order.length - 1) return;
    const next = [...order];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setOrder(next);
  };

  const winner = (property: string) =>
    order.findLast((name) => classOf(name, property));

  return (
    <div sx={styles.root}>
      <div sx={styles.pane}>
        <table sx={styles.table}>
          <thead>
            <tr>
              <th sx={styles.call}>css.props(</th>
              {order.map((name, index) => {
                const last = index === order.length - 1;
                return (
                  <th key={name} sx={styles.call}>
                    <button
                      type="button"
                      sx={[styles.chip, last && styles.last]}
                      aria-disabled={last}
                      aria-label={`Move styles.${name} to the right`}
                      onClick={() => moveRight(index)}
                    >
                      styles.{name}
                      {!last && (
                        <span sx={styles.arrow} aria-hidden>
                          →
                        </span>
                      )}
                    </button>
                    {last ? ' )' : ','}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {PROPERTIES.map((property) => (
              <tr key={property}>
                <th scope="row" sx={styles.property}>
                  {property}
                </th>
                {order.map((name) => {
                  const value = classOf(name, property);
                  return (
                    <td key={name} sx={styles.cell}>
                      {value ? (
                        <span
                          sx={[
                            styles.atom,
                            winner(property) === name
                              ? styles.win
                              : styles.lose,
                          ]}
                        >
                          {value}
                        </span>
                      ) : (
                        <span sx={styles.none} aria-hidden>
                          ·
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div sx={styles.result}>
        <pre sx={styles.output}>
          <code>
            {'<div\n  class="'}
            {classes.map((name, index) => (
              <Fragment key={name}>
                {index > 0 && ' '}
                <span sx={[styles.atom, styles.outputAtom]}>{name}</span>
              </Fragment>
            ))}
            {'"\n/>'}
          </code>
        </pre>
        <div sx={styles.stage}>
          <div {...merged}>Badge</div>
        </div>
      </div>
    </div>
  );
}
