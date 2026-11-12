'use client';

import { theme } from '../theme';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import * as css from '@typedcss/css';
import type { Token } from '../highlight';

const fadeIn = css.keyframes({
  from: {
    opacity: 0,
  },
  to: {
    opacity: 1,
  },
});
const fadeOut = css.keyframes({
  from: {
    opacity: 1,
  },
  to: {
    opacity: 0,
  },
});

const styles = css.create({
  compiled: {
    display: 'grid',
  },
  layer: {
    gridArea: '1 / 1',
    animationDuration: '0.2s',
    animationTimingFunction: 'ease',
    animationFillMode: 'both',
  },
  fadeIn: {
    animationName: fadeIn,
  },
  fadeOut: {
    pointerEvents: 'none',
    animationName: fadeOut,
  },
  caret: {
    display: 'inline-block',
    width: 2,
    height: '1.2em',
    marginLeft: 1,
    verticalAlign: 'text-bottom',
    backgroundColor: theme.accent,
  },
});

const STEP = 48 / 0.8;

const Animation = createContext({
  variants: [] as Token[][][],
  frame: { variant: 0, shown: 0, inlined: false },
});

export function ImportAnimation({
  variants,
  children,
}: {
  variants: Token[][][];
  children: ReactNode;
}) {
  const [frame, setFrame] = useState({ variant: 0, shown: 0, inlined: false });

  useEffect(() => {
    let variant = 0;
    let shown = 0;
    let deleting = false;
    let inlined = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const length = variants[variant][0].reduce(
        (sum, token) => sum + token.text.length,
        0,
      );
      let delay = STEP;
      if (deleting) {
        shown -= 1;
        if (shown === 0) {
          variant = (variant + 1) % variants.length;
          deleting = false;
          delay = STEP * 6;
        }
      } else {
        inlined = variant === 1;
        shown += 1;
        if (shown === length) {
          deleting = true;
          delay = STEP * 20;
        }
      }
      setFrame({ variant, shown, inlined });
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, STEP);
    return () => clearTimeout(timer);
  }, [variants]);

  return (
    <Animation.Provider value={{ variants, frame }}>
      {children}
    </Animation.Provider>
  );
}

export function CompiledCode({
  typedcss,
  plumeria,
}: {
  typedcss: string;
  plumeria: string;
}) {
  const { frame } = useContext(Animation);
  return (
    <div sx={styles.compiled}>
      <div
        sx={[styles.layer, frame.inlined ? styles.fadeOut : styles.fadeIn]}
        aria-hidden={frame.inlined}
        dangerouslySetInnerHTML={{ __html: typedcss }}
      />
      <div
        sx={[styles.layer, frame.inlined ? styles.fadeIn : styles.fadeOut]}
        aria-hidden={!frame.inlined}
        dangerouslySetInnerHTML={{ __html: plumeria }}
      />
    </div>
  );
}

export function Editor() {
  const { variants, frame } = useContext(Animation);
  const lines = variants[frame.variant];

  return (
    <pre className="shiki">
      <code>
        {lines.map((line, row) => {
          let left = frame.shown;
          return (
            <span key={row}>
              {line.map((token, column) => {
                const text =
                  row === 0
                    ? token.text.slice(0, Math.max(left, 0))
                    : token.text;
                left -= token.text.length;
                return text ? (
                  <span key={column} style={token.style}>
                    {text}
                  </span>
                ) : null;
              })}
              {row === 0 && <span sx={styles.caret} />}
              {row < lines.length - 1 && '\n'}
            </span>
          );
        })}
      </code>
    </pre>
  );
}
