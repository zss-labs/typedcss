import * as css from '@typedcss/css';

export const hmrTarget = css.create({
  box: {
    '@media (min-width: 600px)': {
      padding: 40,
    },
  },
});
