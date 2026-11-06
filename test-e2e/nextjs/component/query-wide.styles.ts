import * as css from '@typedcss/css';

export const queryWide = css.create({
  box: {
    '@media (min-width: 900px)': {
      color: 'blue',
    },
  },
});
