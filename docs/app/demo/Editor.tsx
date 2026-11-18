'use client';

import { theme } from '../theme';

import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import * as css from '@typedcss/css';
import type { Token } from '../highlight';
import { styles as demo } from './styles';

const PREFIX = 'sx={[';
const TYPED = 'styles.base, styles.rounded, styles.sky';
const ACCENT = 'css.create';
const MEMBER = 'styles.';
const KEYS = ['base', 'rounded', 'sky'] as const;
const BASE = 'styles.base'.length;
const ROUNDED_AT = BASE + ', styles.'.length;
const ROUNDED = BASE + ', styles.rounded'.length;
const SKY_AT = ROUNDED + ', styles.'.length;
const STEP = 60;
const ERROR =
  "Property 'basa' does not exist on type 'Readonly<{ readonly base: …; readonly rounded: …; readonly sky: … }>'. Did you mean 'base'?";

type Frame = {
  shown: number;
  keys: number;
  menu: number | null;
  typo: boolean;
  error: boolean;
  delay: number;
};

const keysAt = (shown: number) =>
  shown >= TYPED.length ? 3 : shown >= ROUNDED ? 2 : shown >= BASE ? 1 : 0;

const FRAMES: Frame[] = (() => {
  const frames: Frame[] = [];
  const push = (shown: number, delay: number, extra: Partial<Frame> = {}) =>
    frames.push({
      shown,
      keys: keysAt(shown),
      menu: null,
      typo: false,
      error: false,
      delay,
      ...extra,
    });
  const type = (from: number, to: number, menuFrom = Infinity) => {
    for (let shown = from; shown <= to; shown++) {
      push(shown, shown === to && menuFrom <= to ? 160 : STEP, {
        menu: shown >= menuFrom ? 0 : null,
      });
    }
  };
  const pick = (shown: number, target: number, end: number, rest: number) => {
    for (let menu = 0; menu <= target; menu++) {
      push(shown, menu === 0 ? 700 : menu === target ? 600 : 380, { menu });
    }
    push(end, rest);
  };

  push(0, 1400);
  type(1, BASE - 1, MEMBER.length);
  push(BASE, 500, { keys: 0, typo: true });
  push(BASE, 2600, { keys: 0, typo: true, error: true });
  push(BASE - 1, 400);
  push(BASE, 1400);
  type(BASE + 1, ROUNDED_AT);
  pick(ROUNDED_AT, 1, ROUNDED, 1400);
  type(ROUNDED + 1, SKY_AT);
  pick(SKY_AT, 2, TYPED.length, 3000);
  for (let shown = TYPED.length - 1; shown >= 0; shown--) push(shown, 24);
  return frames;
})();

const typedText = (frame: Frame) =>
  TYPED.slice(0, frame.shown - (frame.typo ? 1 : 0)) + (frame.typo ? 'a' : '');

const flash = css.keyframes({
  from: {
    backgroundColor: 'rgba(45, 212, 191, 0.55)',
  },
  to: {
    backgroundColor: 'rgba(45, 212, 191, 0.14)',
  },
});

const styles = css.create({
  anchor: {
    position: 'relative',
  },
  caret: {
    display: 'inline-block',
    width: 2,
    height: '1.2em',
    marginLeft: 1,
    verticalAlign: 'text-bottom',
    backgroundColor: theme.accent,
  },
  accent: {
    color: '#2dd4bf',
  },
  typo: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'wavy',
    textDecorationColor: '#f14c4c',
    textUnderlineOffset: 3,
  },
  menu: {
    position: 'absolute',
    bottom: 'calc(100% + 4px)',
    left: 0,
    zIndex: 1,
    display: 'grid',
    width: 180,
    padding: 2,
    fontSize: 11,
    lineHeight: 1.6,
    color: '#cccccc',
    backgroundColor: '#252526',
    borderColor: '#454545',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 4,
    boxShadow: '0 4px 16px rgb(0 0 0 / 0.36)',
  },
  item: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    padding: '1px 6px',
    borderRadius: 3,
  },
  active: {
    color: '#ffffff',
    backgroundColor: '#04395e',
  },
  icon: {
    width: 9,
    height: 9,
    borderColor: '#75beff',
    borderStyle: 'solid',
    borderWidth: 1.5,
    borderRadius: 2,
  },
  tooltip: {
    position: 'absolute',
    bottom: 'calc(100% + 6px)',
    left: '-11ch',
    zIndex: 1,
    width: 'max-content',
    maxWidth: 'min(360px, 64vw)',
    padding: '8px 10px',
    fontSize: 11,
    lineHeight: 1.5,
    color: '#cccccc',
    whiteSpace: 'normal',
    backgroundColor: '#252526',
    borderColor: '#454545',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 4,
    boxShadow: '0 4px 16px rgb(0 0 0 / 0.36)',
  },
  code: {
    color: '#808080',
  },
  window: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
    backgroundColor: '#1e1e1e',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 12,
    boxShadow: '0 20px 50px rgb(0 0 0 / 0.28)',
  },
  titlebar: {
    display: 'flex',
    gap: 14,
    alignItems: 'center',
    height: 38,
    padding: '0 14px',
    backgroundColor: '#181818',
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
  },
  dots: {
    display: 'flex',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 999,
  },
  tab: {
    fontFamily: 'var(--mono)',
    fontSize: 12,
    color: '#cccccc',
  },
  address: {
    flex: 1,
    maxWidth: 220,
    padding: '3px 10px',
    margin: '0 auto',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    color: '#8a8a8a',
    textAlign: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 6,
  },
  body: {
    display: 'flex',
    flex: 1,
    minWidth: 0,
  },
  gutter: {
    padding: '14px 0 14px 16px',
    margin: 0,
    fontFamily: 'var(--mono)',
    fontSize: 11,
    lineHeight: 1.65,
    color: '#5a5a5a',
    textAlign: 'right',
    userSelect: 'none',
  },
  source: {
    flex: 1,
    minWidth: 0,
  },
  snippet: {
    padding: '14px 16px',
    margin: 0,
    overflowX: 'auto',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    lineHeight: 1.65,
    color: '#d4d4d4',
    tabSize: 2,
  },
  open: {
    padding: '3px 8px',
    marginLeft: 'auto',
    fontSize: 11,
    color: '#9d9d9d',
    textDecoration: 'none',
    borderRadius: 5,
    ':hover': {
      color: '#ffffff',
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
  },
  page: {
    display: 'grid',
    flex: 1,
    placeItems: 'center',
    minHeight: 200,
    color: '#111111',
    backgroundColor: '#f7f7f7',
  },
  classes: {
    padding: '10px 14px',
    margin: 0,
    fontFamily: 'var(--mono)',
    fontSize: 11,
    lineHeight: 1.7,
    color: '#8a8a8a',
    whiteSpace: 'pre-wrap',
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    borderTopStyle: 'solid',
    borderTopWidth: 1,
  },
  atom: {
    padding: '0 2px',
    color: '#5eead4',
    backgroundColor: 'rgba(45, 212, 191, 0.14)',
    borderRadius: 3,
  },
  fresh: {
    animationName: flash,
    animationDuration: '0.8s',
    animationTimingFunction: 'ease-out',
  },
});

const Demo = createContext<{ lines: Token[][]; frame: Frame }>({
  lines: [],
  frame: FRAMES[0],
});

export function LiveDemo({
  lines,
  children,
}: {
  lines: Token[][];
  children: ReactNode;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(
      () => setIndex((index + 1) % FRAMES.length),
      FRAMES[index].delay,
    );
    return () => clearTimeout(timer);
  }, [index]);

  return (
    <Demo.Provider value={{ lines, frame: FRAMES[index] }}>
      {children}
    </Demo.Provider>
  );
}

function Caret({ frame }: { frame: Frame }) {
  const text = typedText(frame);
  const query = text.slice(text.lastIndexOf(MEMBER) + MEMBER.length);
  const items = KEYS.filter((key) => key.startsWith(query));

  return (
    <span sx={styles.anchor}>
      <span sx={styles.caret} />
      {frame.menu !== null && items.length > 0 && (
        <span role="listbox" sx={styles.menu}>
          {items.map((key, index) => (
            <span
              key={key}
              role="option"
              aria-selected={index === frame.menu}
              sx={[styles.item, index === frame.menu && styles.active]}
            >
              <span sx={styles.icon} />
              {key}
            </span>
          ))}
        </span>
      )}
      {frame.error && (
        <span role="tooltip" sx={styles.tooltip}>
          {ERROR} <span sx={styles.code}>ts(2551)</span>
        </span>
      )}
    </span>
  );
}

function renderLine(line: Token[], frame: Frame): ReactNode[] {
  const text = line.map((token) => token.text).join('');
  const editing = text.includes(PREFIX);
  const start = editing ? text.indexOf(PREFIX) + PREFIX.length : -1;
  const accent = text.indexOf(ACCENT);
  const nodes: ReactNode[] = [];
  let column = 0;

  for (const [index, token] of line.entries()) {
    let run = '';
    let mark: 'typo' | 'accent' | null = null;
    const flush = (key: string) => {
      if (!run) return;
      nodes.push(
        <span key={`${index}-${key}`} style={token.style}>
          {mark ? (
            <span sx={mark === 'typo' ? styles.typo : styles.accent}>
              {run}
            </span>
          ) : (
            run
          )}
        </span>,
      );
      run = '';
    };

    for (const char of token.text) {
      const typed = editing ? column - start : -1;
      if (editing && typed === frame.shown) {
        flush(`${column}a`);
        nodes.push(<Caret key="caret" frame={frame} />);
      }
      const visible =
        !editing || typed < 0 || typed >= TYPED.length || typed < frame.shown;
      const next =
        editing && frame.error && typed >= 0 && typed < BASE
          ? 'typo'
          : accent >= 0 && column >= accent && column < accent + ACCENT.length
            ? 'accent'
            : null;
      if (next !== mark) {
        flush(`${column}b`);
        mark = next;
      }
      if (visible) run += frame.typo && typed === BASE - 1 ? 'a' : char;
      column += 1;
    }
    flush('end');
  }

  return nodes;
}

function Titlebar({ children }: { children: ReactNode }) {
  return (
    <div sx={styles.titlebar}>
      <span sx={styles.dots} aria-hidden>
        <span sx={styles.dot} />
        <span sx={styles.dot} />
        <span sx={styles.dot} />
      </span>
      {children}
    </div>
  );
}

export function LiveCode() {
  const { lines, frame } = useContext(Demo);

  return (
    <div sx={styles.window}>
      <Titlebar>
        <span sx={styles.tab}>Button.tsx</span>
        <Link href="/playground?example=merge" {...css.props(styles.open)}>
          Open in Playground →
        </Link>
      </Titlebar>
      <div sx={styles.body}>
        <pre sx={styles.gutter} aria-hidden>
          {lines.map((_, row) => row + 1).join('\n')}
        </pre>
        <div sx={styles.source}>
          <pre sx={styles.snippet}>
            <code>
              {lines.map((line, row) => (
                <Fragment key={row}>
                  {renderLine(line, frame)}
                  {row < lines.length - 1 && '\n'}
                </Fragment>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}

const propsFor = (keys: number) =>
  css.props([
    keys >= 1 && demo.base,
    keys >= 2 && demo.rounded,
    keys >= 3 && demo.sky,
  ]);

const classesFor = (keys: number) =>
  (propsFor(keys).className ?? '').split(' ').filter(Boolean);

export function LivePreview() {
  const { frame } = useContext(Demo);
  const classes = classesFor(frame.keys);
  const before = frame.keys > 0 ? classesFor(frame.keys - 1) : classes;
  const fresh = classes.filter((name) => !before.includes(name));

  return (
    <div sx={styles.window}>
      <Titlebar>
        <span sx={styles.address}>localhost:3000</span>
      </Titlebar>
      <div sx={styles.page}>
        <button type="button" {...propsFor(frame.keys)}>
          Button
        </button>
      </div>
      <pre sx={styles.classes}>
        <code>
          {'class="'}
          {classes.map((name, index) => (
            <Fragment key={`${name}-${frame.keys}`}>
              {index > 0 && ' '}
              <span sx={[styles.atom, fresh.includes(name) && styles.fresh]}>
                {name}
              </span>
            </Fragment>
          ))}
          {'"'}
        </code>
      </pre>
    </div>
  );
}
