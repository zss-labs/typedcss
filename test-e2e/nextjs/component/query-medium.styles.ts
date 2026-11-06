import * as css from '@typedcss/css';

export const queryMedium = css.create({
  box: {
    '@media (min-width: 600px)': {
      color: 'red',
    },
  },
});
