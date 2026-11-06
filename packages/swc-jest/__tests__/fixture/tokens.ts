import * as css from '@typedcss/css';

export const theme = css.createTheme({
  accent: {
    default: '#d907c4',
    '@media (prefers-color-scheme: dark)': '#58c6ff',
  },
});
