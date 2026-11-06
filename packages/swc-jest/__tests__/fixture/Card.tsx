import * as css from '@typedcss/css';
import type { Style } from '@typedcss/css';
import type { ReactNode } from 'react';
import { theme } from '@/tokens';

const styles = css.create({
  base: {
    padding: 8,
    color: 'black',
    backgroundColor: 'white',
  },
  accent: {
    color: theme.accent,
  },
  width: (value: number) => ({
    width: value,
  }),
});

export const Card = ({
  sx,
  children,
}: {
  sx?: Style;
  children?: ReactNode;
}) => <div sx={[styles.base, sx]}>{children}</div>;

export const Accent = ({ width }: { width: number }) => (
  <span sx={[styles.accent, styles.width(width)]}>accent</span>
);

export const overrides = css.create({
  // eslint-disable-next-line @typedcss/no-unused-keys
  danger: {
    backgroundColor: 'red',
  },
});
