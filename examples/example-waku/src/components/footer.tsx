import * as css from '@typedcss/css';

const styles = css.create({
  footer: {
    padding: '1.5rem',
  },
  link: {
    textDecoration: 'underline',
  },
});

export const Footer = () => {
  return (
    <footer sx={styles.footer}>
      <div>
        visit{' '}
        <a
          href="https://waku.gg/"
          target="_blank"
          rel="noreferrer"
          sx={styles.link}
        >
          waku.gg
        </a>{' '}
        to learn more
      </div>
    </footer>
  );
};
