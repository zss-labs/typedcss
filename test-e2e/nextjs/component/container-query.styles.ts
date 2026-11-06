import * as css from '@typedcss/css';

export const containerQuery = css.create({
  narrow: {
    width: 200,
    containerType: 'inline-size',
  },
  wide: {
    width: 400,
    containerType: 'inline-size',
  },
  box: {
    padding: 4,
    '@container (min-width: 300px)': {
      padding: 40,
    },
  },
});
