import * as css from '@typedcss/css';

export const styles = css.create({
  base: {
    padding: '10px 20px',
    fontWeight: 600,
    color: 'black',
    backgroundColor: 'lightgray',
    borderWidth: 0,
    borderRadius: 8,
  },
  rounded: {
    borderRadius: 999,
  },
  sky: {
    backgroundColor: 'skyblue',
  },
});
