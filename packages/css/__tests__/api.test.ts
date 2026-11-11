import * as oxide from '../../oxide';

const filePath = '/tmp/typedcss-api-example.tsx';

const compile = (body: string) => {
  const source = `import * as css from '@typedcss/css';\n${body}`;
  return {
    output: oxide.transform(source, filePath, {
      root: '/tmp',
      styleProp: 'sx',
    }),
    css: oxide
      .compileCss({ root: '/tmp', files: [{ path: filePath, source }] })
      .trim(),
  };
};

describe('@typedcss/css API', () => {
  it('create: static styles', () => {
    const input = `
      const styles = css.create({ text: { color: 'red', padding: 8 } });
      export const App = () => <div sx={styles.text} />;
    `;

    const { output, css } = compile(input);

    expect(output).toContain('className="xq96bg3w xymmdeuh"');
    expect(output).not.toContain('const styles =');
    expect(css.trim()).toBe(`.xq96bg3w { color: red; }
.xymmdeuh { padding: 8px; }`);
  });

  it('create: dynamic values', () => {
    const input = `
      const styles = css.create({ size: (width: number) => ({ width }) });
      export const App = ({ width }: { width: number }) => <div sx={styles.size(width)} />;
    `;

    const { output, css } = compile(input);

    expect(output).toContain('width: "xeycn8ow"');
    expect(output).toContain(
      '"--x9wh76a0-width": typeof width === "number" ? width + "px" : width',
    );
    expect(css.trim()).toBe('.xeycn8ow { width: var(--x9wh76a0-width); }');
  });

  it('createStatic', () => {
    const input = `
      export const values = css.createStatic({ gap: 8, color: 'red' });
    `;

    expect(compile(input)).toMatchInlineSnapshot(`
      {
        "css": "",
        "output": "import * as css from "@typedcss/css";
      export const values = {
      	gap: 8,
      	color: "red"
      };
      ",
      }
    `);
  });

  it('createTheme', () => {
    const input = `
      export const theme = css.createTheme('.dark', {
        color: { default: 'black', theme: 'white' },
      });
    `;

    expect(compile(input)).toMatchInlineSnapshot(`
      {
        "css": ":where(:root) {
        --x2etbn17-color: black;
      }
      .dark {
        --x2etbn17-color: white;
      }",
        "output": "import * as css from "@typedcss/css";
      export const theme = { color: "var(--x2etbn17-color)" };
      ",
      }
    `);
  });

  it('keyframes', () => {
    const input = `
      export const fade = css.keyframes({
        from: { opacity: 0 },
        to: { opacity: 1 },
      });
      export const names = [fade];
    `;

    expect(compile(input)).toMatchInlineSnapshot(`
      {
        "css": "@keyframes kf-x34h9adh {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }",
        "output": "import * as css from "@typedcss/css";
      export const fade = "kf-x34h9adh";
      export const names = [fade];
      ",
      }
    `);
  });

  it('viewTransitionClass', () => {
    const input = `
      export const transition = css.viewTransitionClass({
        old: { opacity: 0 },
        new: { opacity: 1 },
      });
      export const names = [transition];
    `;

    expect(compile(input)).toMatchInlineSnapshot(`
      {
        "css": "::view-transition-old(*.vt-xg6n8ks7) {
        opacity: 0;
      }
      ::view-transition-new(*.vt-xg6n8ks7) {
        opacity: 1;
      }",
        "output": "import * as css from "@typedcss/css";
      export const transition = "vt-xg6n8ks7";
      export const names = [transition];
      ",
      }
    `);
  });

  it('positionTry', () => {
    const input = `
      export const position = css.positionTry({ positionArea: 'top' });
      export const names = [position];
    `;

    expect(compile(input)).toMatchInlineSnapshot(`
      {
        "css": "@position-try --pt-xl7pn6d9 {
        position-area: top;
      }",
        "output": "import * as css from "@typedcss/css";
      export const position = "--pt-xl7pn6d9";
      export const names = [position];
      ",
      }
    `);
  });

  it('varType', () => {
    const input = `
      export const angle = css.varType({ syntax: '<angle>', initialValue: '0deg' });
      export const names = [angle];
    `;

    expect(compile(input)).toMatchInlineSnapshot(`
      {
        "css": "@property --pr-xy9ywt9x {
        syntax: "<angle>";
        inherits: false;
        initial-value: 0deg;
      }",
        "output": "import * as css from "@typedcss/css";
      export const angle = "--pr-xy9ywt9x";
      export const names = [angle];
      ",
      }
    `);
  });

  it('marker and extended', () => {
    const input = `
      export const styles = css.create({
        parent: { ...css.marker('card', ':hover') },
        child: {
          [css.extended('card', ':hover')]: { color: 'red' },
        },
      });
    `;

    expect(compile(input)).toMatchInlineSnapshot(`
      {
        "css": ".x5a0fsd8:hover { --x1f9k2q1-card-hover: 1; }
      @container style(--x1f9k2q1-card-hover: 1) { .xt6727og:not(#\\#) { color: red; } }",
        "output": "import * as css from "@typedcss/css";
      export const styles = {
      	parent: {
      		":hover:--x1f9k2q1-card-hover": "x5a0fsd8",
      		$$w: { ":hover:--x1f9k2q1-card-hover": ["||0,1,0|--x1f9k2q1-card-hover", [
      			0,
      			2,
      			0
      		]] },
      		$$css: true
      	},
      	child: {
      		"@container style(--x1f9k2q1-card-hover: 1):color": "xt6727og",
      		$$css: true
      	}
      };
      ",
      }
    `);
  });

  it('props', () => {
    const input = `
      const styles = css.create({ text: { color: 'red' } });
      export const App = () => <div {...css.props(styles.text)} />;
    `;

    expect(compile(input)).toMatchInlineSnapshot(`
      {
        "css": ".xq96bg3w { color: red; }",
        "output": "import * as css from "@typedcss/css";
      export const App = () => <div className="xq96bg3w" />;
      ",
      }
    `);
  });
});
