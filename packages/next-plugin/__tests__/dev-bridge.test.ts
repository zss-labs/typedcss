import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DEV_BRIDGE_ID,
  devBridge,
  devGenerationsPath,
  generationId,
  withPreviousGenerations,
} from '../src/dev-bridge';
import { carryStylesheet } from '../src/dev-bridge-client';
import { optionsOf } from '../src/shared';

// An edited 'use client' module can render before Next.js delivers the new
// stylesheet, so in development it carries the stylesheet itself until a sheet
// marked with the same generation lands.

const ENV = process.env.NODE_ENV;
afterEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = ENV;
});
const development = () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
};

const project = () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-bridge-')),
  );
  const file = path.join(root, 'app.tsx');
  fs.writeFileSync(
    file,
    `import * as css from '@typedcss/css';
const s = css.create({ a: { color: 'red' } });
export const A = () => <div sx={s.a} />;`,
  );
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  const options = optionsOf({
    resourcePath: file,
    getOptions: () => ({ root, cwd: root }),
  } as never);
  return { root, file, options };
};

describe('generations', () => {
  it('marks the stylesheet and keeps the last three in development', () => {
    development();
    const { root } = project();
    for (const css of ['.a{}', '.b{}', '.c{}', '.d{}'])
      withPreviousGenerations(root, css);
    const kept = withPreviousGenerations(root, '.d{}');
    expect(kept).not.toContain('.a{}');
    expect(kept).toContain('.b{}');
    expect(kept).toContain(
      `[data-typedcss-generation="${generationId('.d{}')}"]`,
    );
    fs.rmSync(devGenerationsPath(root), { force: true });
  });

  it('leaves the stylesheet alone outside development', () => {
    const { root } = project();
    expect(withPreviousGenerations(root, '.a{}')).toBe('.a{}');
  });
});

describe('devBridge', () => {
  it('carries the stylesheet only from the second output of an edited file', () => {
    development();
    const { file, options } = project();
    expect(devBridge(file, 'one', options)).toBe('');
    const script = devBridge(file, 'two', options);
    expect(script).toContain(DEV_BRIDGE_ID);
    expect(script).toContain('color');
  });

  it('carries nothing outside development', () => {
    const { file, options } = project();
    devBridge(file, 'one', options);
    expect(devBridge(file, 'two', options)).toBe('');
  });
});

describe('carryStylesheet', () => {
  const dom = () => {
    const head: any[] = [];
    const sheets: any[] = [];
    let observe: () => void = () => {};
    (global as any).MutationObserver = class {
      constructor(callback: () => void) {
        observe = callback;
      }
      observe() {}
      disconnect() {}
    };
    (global as any).document = {
      get styleSheets() {
        return [
          ...head.map((node) => ({ ownerNode: node, cssRules: [] })),
          ...sheets,
        ];
      },
      getElementById: (id: string) =>
        head.find((node) => node.id === id) ?? null,
      createElement: () => {
        const node: any = {
          dataset: {},
          remove: () => head.splice(head.indexOf(node), 1),
        };
        return node;
      },
      head: { appendChild: (node: any) => head.push(node) },
      addEventListener() {},
      removeEventListener() {},
    };
    return {
      head,
      land: (id: string) => (
        sheets.push({
          ownerNode: {},
          cssRules: [{ selectorText: `[data-typedcss-generation="${id}"]` }],
        }),
        observe()
      ),
    };
  };
  afterEach(() => {
    delete (global as any).document;
    delete (global as any).MutationObserver;
  });

  it('holds the stylesheet until the marked one lands', () => {
    const { head, land } = dom();
    carryStylesheet('.x{}', 'g1', DEV_BRIDGE_ID);
    expect(head).toHaveLength(1);
    expect(head[0].textContent).toBe('.x{}');
    land('g1');
    expect(head).toHaveLength(0);
  });

  it('adds nothing when the marked stylesheet is already there', () => {
    const { head, land } = dom();
    land('g2');
    carryStylesheet('.x{}', 'g2', DEV_BRIDGE_ID);
    expect(head).toHaveLength(0);
  });
});
