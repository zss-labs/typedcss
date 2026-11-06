import * as css from '@typedcss/css';

const styles = css.create({
  test_server: {
    color: 'green',
  },
});

export const ServerComponent = () => {
  return (
    <p sx={styles.test_server} data-testid="e2e-test-p">
      ServerComponent
    </p>
  );
};
