import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  evaluateModule,
  getStyleRecords,
  implementations,
  renderClass,
} from './implementations';

describe.each(implementations)('$name', ({ compileCSS, transformSource }) => {
  const FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-'));

  let fixtureCount = 0;

  // A style reaching a component through a prop is the same style whichever way
  // the component is written, and whichever way the caller imports it. Every form
  // here is one React accepts, so every one has to carry the rule into the sheet.
  // typedcss passes the style itself and merges it where css.props spreads it,
  // so each form is checked by rendering the caller against the definition.
  const compile = async (definition: string, importLine: string) => {
    const id = fixtureCount++;
    const defPath = path.join(FIXTURE_DIR, `definition-${id}.tsx`);
    const callerPath = path.join(FIXTURE_DIR, `caller-${id}.tsx`);
    const defSource = `import * as css from '@typedcss/css';\n${definition}\n`;
    const callerSource =
      `import * as css from '@typedcss/css';\n` +
      `${importLine.replace('./definition', `./definition-${id}`)}\n` +
      `const s = css.create({ boxed: { color: 'purple' } });\n` +
      `export const App = () => <Card cardStyle={s.boxed} />;\n`;
    fs.writeFileSync(defPath, defSource, 'utf-8');
    fs.writeFileSync(callerPath, callerSource, 'utf-8');

    const transformed = async (source: string, filePath: string) =>
      (
        await transformSource({
          source,
          filePath,
          root: FIXTURE_DIR,
          cwd: FIXTURE_DIR,
        })
      ).code;
    const def = evaluateModule(await transformed(defSource, defPath), defPath);
    const caller = await transformed(callerSource, callerPath);
    const element = renderClass(caller, {}, 'App', (name) =>
      name === `./definition-${id}` ? def : undefined,
    );
    const css = compileCSS({
      cwd: FIXTURE_DIR,
      include: [path.basename(defPath), path.basename(callerPath)],
      exclude: [],
    });
    return { css, element };
  };

  afterAll(() => fs.rmSync(FIXTURE_DIR, { recursive: true, force: true }));

  const PURPLE = getStyleRecords({ color: 'purple' })[0].hash;
  const named = `import { Card } from './definition';`;
  const fromDefault = `import Card from './definition';`;

  describe('compiler: the forms a component receiving a style can take', () => {
    it('reads the parameter of an arrow function assigned to a const', async () => {
      const { css, element } = await compile(
        `export const Card = (props: any) => <div {...css.props(props.cardStyle)} />;`,
        named,
      );
      expect(css).toContain('color: purple');
      expect(element).toBe(PURPLE);
    });

    it('reads the parameter of an exported function declaration', async () => {
      const { css, element } = await compile(
        `export function Card(props: any) { return <div {...css.props(props.cardStyle)} />; }`,
        named,
      );
      expect(css).toContain('color: purple');
      expect(element).toBe(PURPLE);
    });

    it('reads the parameter of a function declaration exported below', async () => {
      const { css, element } = await compile(
        `function Card(props: any) { return <div {...css.props(props.cardStyle)} />; }\nexport { Card };`,
        named,
      );
      expect(css).toContain('color: purple');
      expect(element).toBe(PURPLE);
    });

    it('reads the parameter of a default exported function declaration', async () => {
      const { css, element } = await compile(
        `export default function Card(props: any) { return <div {...css.props(props.cardStyle)} />; }`,
        fromDefault,
      );
      expect(css).toContain('color: purple');
      expect(element).toBe(PURPLE);
    });

    it('reads the parameter of a default exported anonymous function', async () => {
      const { css, element } = await compile(
        `export default function (props: any) { return <div {...css.props(props.cardStyle)} />; }`,
        fromDefault,
      );
      expect(css).toContain('color: purple');
      expect(element).toBe(PURPLE);
    });

    it('reads the parameter of a default exported arrow function', async () => {
      const { css, element } = await compile(
        `export default (props: any) => <div {...css.props(props.cardStyle)} />;`,
        fromDefault,
      );
      expect(css).toContain('color: purple');
      expect(element).toBe(PURPLE);
    });

    it('reads the parameter of a const the default export names', async () => {
      // The scanner keys this component as `default`, because the local name is
      // not an export of its own. The name the definition file knows it by has
      // to keep finding the styles the caller passed.
      const { css, element } = await compile(
        `const Card = (props: any) => <div {...css.props(props.cardStyle)} />;\nexport default Card;`,
        fromDefault,
      );
      expect(css).toContain('color: purple');
      expect(element).toBe(PURPLE);
    });

    it('reads the parameter of a component a call wraps', async () => {
      // `memo`, `forwardRef` and any other wrapper leave the component a function
      // argument of a call, which is still the function whose parameter names the
      // styles handed to it.
      const { css, element } = await compile(
        `import { memo } from 'react';\nexport const Card = memo((props: any) => <div {...css.props(props.cardStyle)} />);`,
        named,
      );
      expect(css).toContain('color: purple');
      expect(element).toBe(PURPLE);
    });

    it('reads the parameter through nested wrappers', async () => {
      const { css, element } = await compile(
        `import { memo, forwardRef } from 'react';\nexport const Card = memo(forwardRef(({ cardStyle }: any, ref: any) => <div ref={ref} {...css.props(cardStyle)} />));`,
        named,
      );
      expect(css).toContain('color: purple');
      expect(element).toBe(PURPLE);
    });

    it('reads the parameter of a wrapped default export', async () => {
      // The component is the function the call holds, wherever in the argument
      // list it sits, and a call is what the default export names here.
      const { css, element } = await compile(
        `const withOptions = (options: unknown, component: unknown) => component;\n` +
          `export default withOptions(\n` +
          `  { displayName: 'Card' },\n` +
          `  (props: any) => <div {...css.props(props.cardStyle)} />,\n` +
          `);`,
        fromDefault,
      );
      expect(css).toContain('color: purple');
      expect(element).toBe(PURPLE);
    });

    it('reads a destructured parameter of a function declaration', async () => {
      const { css, element } = await compile(
        `export function Card({ cardStyle }: any) { return <div {...css.props(cardStyle)} />; }`,
        named,
      );
      expect(css).toContain('color: purple');
      expect(element).toBe(PURPLE);
    });
  });
});
