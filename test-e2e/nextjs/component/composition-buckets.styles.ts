import * as css from '@typedcss/css';

export const buckets = css.create({
  wide: {
    width: '100%',
  },
  narrow: {
    '@media (max-width: 768px)': {
      width: 200,
    },
  },
});
