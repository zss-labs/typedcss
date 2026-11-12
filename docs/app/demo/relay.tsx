'use client';

import { createContext, use } from 'react';
import * as css from '@typedcss/css';

const styles = css.create({
  surface: {
    padding: 24,
    backgroundColor: 'white',
  },
  card: {
    borderRadius: 12,
  },
  rounded: {
    borderRadius: 24,
  },
  wide: {
    maxWidth: 640,
  },
  narrow: {
    maxWidth: 320,
  },
});

// #region relay
const Theme = createContext<css.Style>(null);

function Surface({ sx }: { sx?: css.Style }) {
  const theme = use(Theme);

  return <div sx={[styles.surface, theme, sx]} />;
}

function Card({ sx }: { sx?: css.Style }) {
  return <Surface sx={[styles.card, sx]} />;
}

export function Page({ wide }: { wide: boolean }) {
  const size = wide ? styles.wide : styles.narrow;

  return (
    <Theme value={styles.rounded}>
      <Card sx={size} />
    </Theme>
  );
}
// #endregion
