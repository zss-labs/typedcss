'use client';

import * as css from '@typedcss/css';
import { useEffect, useState } from 'react';
import { docs } from './theme';

const styles = css.create({
  toggle: {
    display: 'inline-flex',
    padding: 3,
    borderColor: docs.docBorder,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 9999,
  },
  option: {
    display: 'flex',
    padding: 6,
    color: docs.docMuted,
    cursor: 'pointer',
    background: 'none',
    borderWidth: 0,
    borderRadius: 9999,
    transitionDuration: '0.2s',
    transitionProperty: 'color, background-color',
    ':hover': {
      color: docs.docFg,
    },
  },
  active: {
    color: docs.docFg,
    background: docs.docAccent,
  },
});

type Choice = 'light' | 'dark' | 'system';

const options = [
  {
    value: 'light',
    label: 'Light theme',
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </>
    ),
  },
  {
    value: 'dark',
    label: 'Dark theme',
    icon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  },
  {
    value: 'system',
    label: 'System theme',
    icon: (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
  },
] as const;

const KEY = 'typedcss-theme';

const read = (): Choice => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // localStorage unavailable
  }
  return 'system';
};

const apply = (choice: Choice) => {
  const dark =
    choice === 'dark' ||
    (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
};

export function ThemeSwitch() {
  // The stored choice is unknown on the server, so nothing is marked until hydration.
  const [choice, setChoice] = useState<Choice | null>(null);

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const next = read();
      apply(next);
      setChoice(next);
    };
    sync();
    media.addEventListener('change', sync);
    window.addEventListener('storage', sync);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const select = (value: Choice) => {
    try {
      if (value === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, value);
    } catch {
      // localStorage unavailable
    }
    apply(value);
    setChoice(value);
  };

  return (
    <div role="group" aria-label="Theme" sx={styles.toggle}>
      {options.map(({ value, label, icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={choice === value}
          sx={[styles.option, choice === value && styles.active]}
          onClick={() => select(value)}
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
            {icon}
          </svg>
        </button>
      ))}
    </div>
  );
}
