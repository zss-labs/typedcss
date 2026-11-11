import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detect } from '../src/detect';
import {
  DEFAULT_ANSWERS,
  DEFAULT_STYLE_PROP,
  assertStyleProp,
  buildScript,
  bundlerSource,
  compilerOption,
  declarationSource,
  eslintEntries,
  eslintSource,
  installCommand,
  OXLINT_RECOMMENDED,
  packages,
  plan,
  pluginCall,
  pluginOptions,
  rejectedSpelling,
  spellingRule,
} from '../src/setup';
import type { Action, Answers } from '../src/setup';

const add = (dir: string, name: string, content: string) => {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
};

const answers = (fields: Partial<Answers> = {}): Answers => ({
  ...DEFAULT_ANSWERS,
  ...fields,
});

const on = (actions: Action[], file: string): Action => {
  const action = actions.find((a) => a.kind !== 'install' && a.file === file);
  if (!action) throw new Error(`nothing planned for ${file}`);
  return action;
};

const contentsOf = (action: Action): string => {
  if (action.kind !== 'write' && action.kind !== 'patch') {
    throw new Error(`${action.kind} carries no contents`);
  }
  return action.contents;
};

const NEXT_CONFIG = `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;

const VITE_CONFIG = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`;

describe('source generators', () => {
  it('accepts identifiers and rejects invalid or reserved style props', () => {
    expect(assertStyleProp('$style')).toBe('$style');
    expect(() => assertStyleProp('style-prop')).toThrow(/valid identifier/);
    expect(() => assertStyleProp('className')).toThrow(/used by React/);
  });

  it('exposes setup defaults and helpers', () => {
    expect(DEFAULT_STYLE_PROP).toBe('sx');
    expect(rejectedSpelling('none')).toBeUndefined();
    expect(packages).toEqual(expect.any(Function));
  });

  it('covers JavaScript and unsupported fresh bundler forms', () => {
    expect(bundlerSource('next', answers(), false)).toContain(
      'withTypedCSS({})',
    );
    expect(bundlerSource('astro', answers(), true)).toContain('vite:');
    expect(bundlerSource('webpack', answers(), true)).toBeUndefined();
    expect(eslintSource(answers(), false)).toContain('**/*.{js,jsx}');
    expect(eslintEntries(answers(), false)).toEqual([
      'typedcss.configs.recommended',
    ]);
  });

  it('names a renamed styling prop in the ESLint settings', () => {
    expect(eslintSource(answers(), true)).not.toContain('settings:');
    expect(
      eslintEntries(answers({ styleProp: 'classStyle' }), false)[1],
    ).toContain("files: ['**/*.{js,jsx}']");
    const source = eslintSource(answers({ styleProp: 'classStyle' }), true);
    expect(source).toContain("      typedcss: { styleProp: 'classStyle' },");
    expect(eslintEntries(answers({ styleProp: 'classStyle' }), true)).toEqual([
      'typedcss.configs.recommended',
      [
        '{',
        "  files: ['**/*.{ts,tsx}'],",
        '  settings: {',
        "    typedcss: { styleProp: 'classStyle' },",
        '  },',
        '}',
      ].join('\n'),
    ]);
  });

  it('covers plugin, script, and package-manager variants', () => {
    expect(pluginOptions(answers({ styleProp: 'classStyle' }))).toContain(
      "styleProp: 'classStyle'",
    );
    expect(pluginCall('bun', answers(), 'p')).toBe('p.bun()');
    expect(buildScript('vite build', 'sx')).toBe('typedcss-lint -- vite build');
    expect(buildScript('vite build', 'classStyle')).toBe(
      'typedcss-lint --style-prop classStyle -- vite build',
    );
    expect(installCommand('yarn', ['a'])).toBe('yarn add -D a');
    expect(installCommand('bun', ['a'])).toBe('bun add -d a');
    expect(installCommand('npm', ['a'], false)).toBe('npm i a');
    expect(installCommand('pnpm', ['a'], false)).toBe('pnpm add a');
  });
});

describe('the spelling answer', () => {
  it('rejects the counterpart on both sides', () => {
    expect(compilerOption(answers({ spelling: 'logical' }))).toBe(
      'withoutPhysicalProperties: true',
    );
    expect(spellingRule(answers({ spelling: 'logical' }))).toBe(
      "'@typedcss/no-physical-properties': 'error'",
    );
    expect(compilerOption(answers({ spelling: 'physical' }))).toBe(
      'withoutLogicalProperties: true',
    );
    expect(spellingRule(answers({ spelling: 'physical' }))).toBe(
      "'@typedcss/no-logical-properties': 'error'",
    );
  });

  it('carries the size axis to both sides', () => {
    const both = answers({ spelling: 'physical', sizes: true });
    expect(compilerOption(both)).toBe(
      'withoutLogicalProperties: { sizes: true }',
    );
    expect(spellingRule(both)).toBe(
      "'@typedcss/no-logical-properties': ['error', { sizes: true }]",
    );
  });

  it('sets neither side when no spelling is enforced', () => {
    expect(compilerOption(answers({ spelling: 'none' }))).toBeUndefined();
    expect(spellingRule(answers({ spelling: 'none' }))).toBeUndefined();
  });
});

describe('the declaration', () => {
  it('references the shipped one for the default prop', () => {
    expect(declarationSource(answers())).toBe(
      '/// <reference types="@typedcss/css/sx" />\n',
    );
  });

  it('declares the prop the project renamed to', () => {
    const source = declarationSource(answers({ styleProp: 'classStyle' }));
    expect(source).toContain("import type { Style } from '@typedcss/css';");
    expect(source).toContain('classStyle?: Style;');
  });
});

describe('plan', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-plan-')),
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const project = (
    fields: Record<string, unknown>,
    files: Record<string, string>,
  ) => {
    add(dir, 'package.json', `${JSON.stringify(fields, null, 2)}\n`);
    for (const [name, content] of Object.entries(files))
      add(dir, name, content);
  };

  it('declares the styling prop in src when the project has one', () => {
    project(
      { name: 'app', devDependencies: { vite: '^8.0.13' } },
      {
        'vite.config.ts': VITE_CONFIG,
        'tsconfig.json': '{}',
        'src/main.tsx': '',
      },
    );

    expect(on(plan(detect(dir), answers()), 'src/typedcss.d.ts').kind).toBe(
      'write',
    );
  });

  it('declares the styling prop at the root without src', () => {
    project(
      { name: 'app', devDependencies: { vite: '^8.0.13' } },
      { 'vite.config.ts': VITE_CONFIG, 'tsconfig.json': '{}' },
    );

    expect(on(plan(detect(dir), answers()), 'typedcss.d.ts').kind).toBe(
      'write',
    );
  });

  it('wraps the Next config and carries the policy into it', () => {
    project(
      {
        name: 'app',
        scripts: { build: 'next build' },
        dependencies: { next: '^16.3.1' },
      },
      { 'next.config.ts': NEXT_CONFIG, 'tsconfig.json': '{}' },
    );

    const actions = plan(
      detect(dir),
      answers({ spelling: 'physical', sizes: true }),
    );
    const patched = contentsOf(on(actions, 'next.config.ts'));

    expect(patched).toContain(
      "import { withTypedCSS } from '@typedcss/next-plugin';",
    );
    expect(patched).toContain(
      'export default withTypedCSS(nextConfig, { withoutLogicalProperties: { sizes: true } });',
    );
  });

  it('registers the unplugin and carries the policy into it', () => {
    project(
      { name: 'app', devDependencies: { vite: '^8.0.13' } },
      { 'vite.config.ts': VITE_CONFIG, 'tsconfig.json': '{}' },
    );

    const actions = plan(
      detect(dir),
      answers({ spelling: 'logical', styleProp: 'classStyle' }),
    );
    const patched = contentsOf(on(actions, 'vite.config.ts'));

    expect(patched).toContain("import typedcss from '@typedcss/unplugin';");
    expect(patched).toContain(
      "plugins: [react(), typedcss.vite({ styleProp: 'classStyle', withoutPhysicalProperties: true })]",
    );
  });

  it('writes a config when the bundler has none', () => {
    project(
      { name: 'app', devDependencies: { vite: '^8.0.13' } },
      { 'tsconfig.json': '{}' },
    );

    const action = on(plan(detect(dir), answers()), 'vite.config.ts');
    expect(action.kind).toBe('write');
    expect(contentsOf(action)).toContain('plugins: [typedcss.vite()]');
  });

  it('hands back a snippet when the plugin cannot be placed', () => {
    project({ name: 'app', devDependencies: { esbuild: '^0.28.0' } }, {});

    const actions = plan(detect(dir), answers({ eslint: false }));
    const manual = actions.find((action) => action.kind === 'manual');
    expect(manual).toBeDefined();
    if (manual?.kind !== 'manual') throw new Error('expected a manual action');
    expect(manual.snippet).toContain('plugins: [typedcss.esbuild()]');
  });

  it('describes a fresh Bun build as build-script work', () => {
    project({ name: 'app' }, {});

    const action = plan(detect(dir, 'bun'), answers({ eslint: false })).find(
      (candidate) => candidate.kind === 'manual',
    );
    expect(action).toMatchObject({
      kind: 'manual',
      note: 'add the plugin to the build script',
    });
  });

  it('reports a missing config for another unsupported bundler', () => {
    project({ name: 'app' }, {});

    const action = plan(
      detect(dir, 'webpack'),
      answers({ eslint: false }),
    ).find((candidate) => candidate.kind === 'manual');
    expect(action).toMatchObject({
      kind: 'manual',
      note: 'no webpack config found',
    });
  });

  it('puts the opt-in rules in the ESLint config it writes', () => {
    project(
      { name: 'app', devDependencies: { vite: '^8.0.13' } },
      { 'tsconfig.json': '{}' },
    );

    const written = contentsOf(
      on(
        plan(detect(dir), answers({ spelling: 'logical' })),
        'eslint.config.ts',
      ),
    );
    expect(written).toContain('typedcss.configs.recommended,');
    expect(written).toContain("'@typedcss/no-physical-properties': 'error',");
    expect(written).toContain('parserOptions: { projectService: true }');
  });

  it('leaves the opt-in rules out when they were not asked for', () => {
    project(
      { name: 'app', devDependencies: { vite: '^8.0.13' } },
      { 'tsconfig.json': '{}' },
    );

    const written = contentsOf(
      on(plan(detect(dir), answers()), 'eslint.config.ts'),
    );
    expect(written).toContain('typedcss.configs.recommended,');
    expect(written).not.toContain('rules:');
  });

  it('guards the build script of a bundler the plugin cannot lint', () => {
    project(
      {
        name: 'app',
        scripts: { build: 'node build.mjs' },
        devDependencies: { esbuild: '^0.28.0' },
      },
      { 'tsconfig.json': '{}' },
    );

    const patched = JSON.parse(
      contentsOf(on(plan(detect(dir), answers()), 'package.json')),
    ) as {
      scripts: Record<string, string>;
    };
    expect(patched.scripts.build).toBe('typedcss-lint -- node build.mjs');
  });

  it('renames typedcsslint to typedcss-lint in the build script', () => {
    project(
      {
        name: 'app',
        scripts: {
          build: 'typedcsslint --style-prop classStyle -- node build.mjs',
        },
        devDependencies: { esbuild: '^0.28.0' },
      },
      { 'tsconfig.json': '{}' },
    );

    const patched = JSON.parse(
      contentsOf(on(plan(detect(dir), answers()), 'package.json')),
    ) as {
      scripts: Record<string, string>;
    };
    expect(patched.scripts.build).toBe(
      'typedcss-lint --style-prop classStyle -- node build.mjs',
    );
  });

  it('names a renamed styling prop in the guarded build script', () => {
    project(
      {
        name: 'app',
        scripts: { build: 'node build.mjs' },
        devDependencies: { esbuild: '^0.28.0' },
      },
      { 'tsconfig.json': '{}' },
    );

    const patched = JSON.parse(
      contentsOf(
        on(
          plan(detect(dir), answers({ styleProp: 'classStyle' })),
          'package.json',
        ),
      ),
    ) as {
      scripts: Record<string, string>;
    };
    expect(patched.scripts.build).toBe(
      'typedcss-lint --style-prop classStyle -- node build.mjs',
    );
  });

  it('leaves the build script alone where the plugin lints the build', () => {
    project(
      {
        name: 'app',
        scripts: { build: 'tsc -b && vite build' },
        devDependencies: { vite: '^8.0.13' },
      },
      { 'tsconfig.json': '{}' },
    );

    expect(() => on(plan(detect(dir), answers()), 'package.json')).toThrow(
      'nothing planned for package.json',
    );
  });

  it('installs only what is missing', () => {
    project(
      {
        name: 'app',
        devDependencies: {
          vite: '^8.0.13',
          '@typedcss/css': '^19.1.1',
          oxlint: '1.67.0',
        },
      },
      { 'tsconfig.json': '{}', 'eslint.config.ts': 'export default [];\n' },
    );

    const install = plan(detect(dir), answers()).find(
      (action) => action.kind === 'install',
    );
    if (install?.kind !== 'install')
      throw new Error('expected an install action');
    expect(install.packages).toEqual([
      '@typedcss/unplugin',
      '@typedcss/eslint-plugin',
    ]);
  });

  it('installs the runtime separately from development tools', () => {
    project(
      {
        name: 'app',
        packageManager: 'pnpm@10.20.0',
        devDependencies: { vite: '^8.0.13', oxlint: '1.67.0' },
      },
      { 'tsconfig.json': '{}', 'eslint.config.ts': 'export default [];\n' },
    );

    const installs = plan(detect(dir), answers()).filter(
      (action) => action.kind === 'install',
    );
    expect(installs).toMatchObject([
      {
        command: 'pnpm add @typedcss/css',
        packages: ['@typedcss/css'],
      },
      {
        command: 'pnpm add -D @typedcss/unplugin @typedcss/eslint-plugin',
        packages: ['@typedcss/unplugin', '@typedcss/eslint-plugin'],
      },
    ]);
  });

  it('writes nothing twice', () => {
    project(
      {
        name: 'app',
        scripts: { build: 'typedcss-lint -- vite build' },
        devDependencies: { vite: '^8.0.13' },
      },
      {
        'tsconfig.json': '{}',
        'typedcss.d.ts': '/// <reference types="@typedcss/css/sx" />\n',
        'vite.config.ts': `import typedcss from '@typedcss/unplugin';\n\nexport default { plugins: [typedcss.vite()] };\n`,
        'eslint.config.ts': `import typedcss from '@typedcss/eslint-plugin';\n\nexport default [typedcss.configs.recommended];\n`,
      },
    );

    const actions = plan(detect(dir), answers());
    expect(
      actions
        .filter((action) => action.kind !== 'install')
        .every((action) => action.kind === 'skip'),
    ).toBe(true);
  });

  it('supports CommonJS imports for Next and unplugin configs', () => {
    project(
      { dependencies: { next: '1' } },
      { 'next.config.cjs': 'module.exports = {};\n' },
    );
    expect(
      contentsOf(on(plan(detect(dir), answers()), 'next.config.cjs')),
    ).toContain("const { withTypedCSS } = require('@typedcss/next-plugin');");

    fs.rmSync(path.join(dir, 'next.config.cjs'));
    project(
      { devDependencies: { webpack: '1' } },
      { 'webpack.config.cjs': 'module.exports = { plugins: [] };\n' },
    );
    expect(
      contentsOf(on(plan(detect(dir), answers()), 'webpack.config.cjs')),
    ).toContain("const typedcss = require('@typedcss/unplugin').default;");
  });

  it('recognizes an applied Next wrapper and reports an unwrappable config', () => {
    project(
      { dependencies: { next: '1' } },
      {
        'next.config.ts': `import { withTypedCSS } from '@typedcss/next-plugin';\n\nexport default withTypedCSS({});\n`,
      },
    );
    expect(on(plan(detect(dir), answers()), 'next.config.ts').kind).toBe(
      'skip',
    );

    add(
      dir,
      'next.config.ts',
      `const nextConfig = {};\nconsole.log(nextConfig);\n`,
    );
    const action = on(plan(detect(dir), answers()), 'next.config.ts');
    expect(action.kind).toBe('manual');
    if (action.kind === 'manual') {
      expect(action.snippet).toContain('withTypedCSS(nextConfig)');
    }
  });

  it('adds an Astro vite block and explains malformed configs', () => {
    project(
      { devDependencies: { astro: '1' } },
      { 'astro.config.ts': `export default defineConfig({});\n` },
    );
    expect(
      contentsOf(on(plan(detect(dir), answers()), 'astro.config.ts')),
    ).toContain('vite: {');

    add(dir, 'astro.config.ts', `export default {};\n`);
    let action = on(plan(detect(dir), answers()), 'astro.config.ts');
    expect(action.kind).toBe('manual');
    if (action.kind === 'manual') expect(action.snippet).toContain('vite: {');

    add(dir, 'astro.config.ts', `export default defineConfig();\n`);
    action = on(plan(detect(dir), answers()), 'astro.config.ts');
    expect(action.kind).toBe('manual');

    add(
      dir,
      'astro.config.ts',
      `export default defineConfig();\nconst later = {};\n`,
    );
    action = on(plan(detect(dir), answers()), 'astro.config.ts');
    expect(action.kind).toBe('manual');
  });

  it('reports legacy and unextendable ESLint configs', () => {
    project(
      { devDependencies: { vite: '1' } },
      { '.eslintrc.json': '{}', 'vite.config.ts': VITE_CONFIG },
    );
    expect(on(plan(detect(dir), answers()), '.eslintrc.json').kind).toBe(
      'manual',
    );

    fs.rmSync(path.join(dir, '.eslintrc.json'));
    add(dir, 'eslint.config.cjs', 'module.exports = value;\n');
    const action = on(plan(detect(dir), answers()), 'eslint.config.cjs');
    expect(action.kind).toBe('manual');
    if (action.kind === 'manual') {
      expect(action.snippet).toContain('typedcss.configs.recommended');
    }
  });

  it('writes a JavaScript ESLint config and can skip installation', () => {
    project(
      {
        scripts: { build: 'vite build' },
        devDependencies: {
          vite: '1',
          '@typedcss/css': '1',
          '@typedcss/unplugin': '1',
          '@typedcss/eslint-plugin': '1',
          oxlint: '1',
          eslint: '1',
          '@eslint/js': '1',
        },
      },
      { 'vite.config.js': VITE_CONFIG },
    );
    const actions = plan(detect(dir), answers());
    expect(on(actions, 'eslint.config.mjs').kind).toBe('write');
    expect(actions.some((action) => action.kind === 'install')).toBe(false);
  });

  it('adds the plugin to an oxlint config instead of writing an ESLint config', () => {
    project(
      { devDependencies: { vite: '1', oxlint: '1' } },
      {
        'vite.config.ts': VITE_CONFIG,
        '.oxlintrc.json': `{\n    "plugins": ["typescript"],\n    "rules": { "no-debugger": "error" }\n}\n`,
      },
    );
    const actions = plan(
      detect(dir),
      answers({ spelling: 'logical', sizes: true, styleProp: 'classStyle' }),
    );
    expect(
      actions.some(
        (action) =>
          action.kind !== 'install' && action.file.startsWith('eslint.config'),
      ),
    ).toBe(false);
    const install = actions.find((action) => action.kind === 'install');
    expect(install?.kind === 'install' && install.packages).not.toContain(
      'eslint',
    );

    const action = on(actions, '.oxlintrc.json');
    expect(action.kind).toBe('patch');
    const contents = contentsOf(action);
    expect(contents).toContain('\n    "plugins"');
    const config = JSON.parse(contents);
    expect(config.plugins).toEqual(['typescript']);
    expect(config.jsPlugins).toEqual([
      { name: '@typedcss', specifier: '@typedcss/eslint-plugin/oxlint-plugin' },
    ]);
    expect(config.rules['no-debugger']).toBe('error');
    expect(config.rules['@typedcss/no-unknown-css-properties']).toBe('error');
    expect(config.rules['@typedcss/no-physical-properties']).toEqual([
      'error',
      { sizes: true },
    ]);
    expect(config.settings).toEqual({ typedcss: { styleProp: 'classStyle' } });
  });

  it('skips an oxlint config that already loads the plugin and hands over one with comments', () => {
    project(
      { devDependencies: { vite: '1' } },
      {
        'vite.config.ts': VITE_CONFIG,
        '.oxlintrc.json': `{ "jsPlugins": ["@typedcss/eslint-plugin/oxlint-plugin"] }\n`,
      },
    );
    expect(on(plan(detect(dir), answers()), '.oxlintrc.json').kind).toBe(
      'skip',
    );

    add(dir, '.oxlintrc.json', `{\n  // project rules\n  "rules": {}\n}\n`);
    const action = on(plan(detect(dir), answers()), '.oxlintrc.json');
    expect(action.kind).toBe('manual');
    if (action.kind === 'manual') {
      expect(JSON.parse(action.snippet).rules).toEqual(OXLINT_RECOMMENDED);
    }
  });

  it('prefers the ESLint config when both linters are configured', () => {
    project(
      { devDependencies: { vite: '1' } },
      {
        'vite.config.ts': VITE_CONFIG,
        'eslint.config.mjs': 'export default [];\n',
        '.oxlintrc.json': '{}\n',
      },
    );
    const actions = plan(detect(dir), answers());
    expect(on(actions, 'eslint.config.mjs').kind).toBe('patch');
    expect(() => on(actions, '.oxlintrc.json')).toThrow();
  });

  it('keeps the oxlint rules in step with the recommended oxlint config', () => {
    const shipped = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '../../eslint-plugin/oxlint.json'),
        'utf8',
      ),
    );
    expect(OXLINT_RECOMMENDED).toEqual(shipped.rules);
  });

  it('preserves compact package JSON indentation', () => {
    add(
      dir,
      'package.json',
      JSON.stringify({
        scripts: { build: 'node build.mjs' },
        devDependencies: { esbuild: '1' },
      }),
    );
    const patched = contentsOf(
      on(plan(detect(dir), answers()), 'package.json'),
    );
    expect(patched).toContain('\n  "scripts"');
  });
});

describe('what a config already carries', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-carry-')),
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const project = (
    fields: Record<string, unknown>,
    files: Record<string, string>,
  ) => {
    add(dir, 'package.json', `${JSON.stringify(fields, null, 2)}\n`);
    for (const [name, content] of Object.entries(files))
      add(dir, name, content);
  };

  const vite = (
    fields: Record<string, unknown>,
    files: Record<string, string>,
  ) =>
    project(
      { name: 'app', devDependencies: { vite: '^8.0.13' }, ...fields },
      {
        'tsconfig.json': '{}',
        ...files,
      },
    );

  it('leaves a sibling plugins array alone', () => {
    vite(
      {},
      {
        'vite.config.ts': `import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    plugins: [],
  },
  plugins: [react()],
});
`,
      },
    );

    const patched = contentsOf(
      on(plan(detect(dir), answers()), 'vite.config.ts'),
    );
    expect(patched).toContain('plugins: [react(), typedcss.vite()],');
    expect(patched).toContain('    plugins: [],\n');
  });

  it('hands back a snippet rather than write into a foreign plugins array', () => {
    vite(
      {},
      {
        'vite.config.ts': `import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    plugins: [],
  },
});
`,
      },
    );

    const action = on(plan(detect(dir), answers()), 'vite.config.ts');
    expect(action.kind).toBe('manual');
  });

  it('registers the plugin when only the import is there', () => {
    vite(
      {},
      {
        'vite.config.ts': `import { defineConfig } from 'vite';
import typedcss from '@typedcss/unplugin';

export default defineConfig({
  plugins: [react()],
});
`,
      },
    );

    const action = on(plan(detect(dir), answers()), 'vite.config.ts');
    expect(action.kind).toBe('patch');
    const patched = contentsOf(action);
    expect(patched).toContain('typedcss.vite()');
    expect(patched.match(/@typedcss\/unplugin/g)).toHaveLength(1);
  });

  it('calls the binding the config already named', () => {
    vite(
      {},
      {
        'vite.config.ts': `import zero from '@typedcss/unplugin';

export default { plugins: [react()] };
`,
      },
    );

    expect(
      contentsOf(on(plan(detect(dir), answers()), 'vite.config.ts')),
    ).toContain('plugins: [react(), zero.vite()]');
  });

  it('skips only once the plugin is actually called', () => {
    vite(
      {},
      {
        'vite.config.ts': `import typedcss from '@typedcss/unplugin';

export default { plugins: [typedcss.vite()] };
`,
      },
    );

    expect(on(plan(detect(dir), answers()), 'vite.config.ts').kind).toBe(
      'skip',
    );
  });

  it('wraps a Next config that imports withTypedCSS without using it', () => {
    project(
      {
        name: 'app',
        scripts: { build: 'next build' },
        dependencies: { next: '^16.3.1' },
      },
      {
        'tsconfig.json': '{}',
        'next.config.ts': `import { withTypedCSS } from '@typedcss/next-plugin';

const nextConfig = {};

export default nextConfig;
`,
      },
    );

    const action = on(plan(detect(dir), answers()), 'next.config.ts');
    expect(action.kind).toBe('patch');
    const patched = contentsOf(action);
    expect(patched).toContain('export default withTypedCSS(nextConfig);');
    expect(patched.match(/@typedcss\/next-plugin/g)).toHaveLength(1);
  });

  it('extends an ESLint config that imports the plugin without using it', () => {
    vite(
      {},
      {
        'eslint.config.ts': `import typedcss from '@typedcss/eslint-plugin';

export default [base];
`,
      },
    );

    const action = on(plan(detect(dir), answers()), 'eslint.config.ts');
    expect(action.kind).toBe('patch');
    expect(contentsOf(action)).toContain('typedcss.configs.recommended,');
  });
});

describe('the Next cache', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-next-')),
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const next = (
    scripts: Record<string, string>,
    extra: Record<string, string> = {},
  ) => {
    add(
      dir,
      'package.json',
      `${JSON.stringify({ name: 'app', scripts, dependencies: { next: '^16.3.1' } }, null, 2)}\n`,
    );
    add(dir, 'tsconfig.json', '{}');
    for (const [name, content] of Object.entries(extra))
      add(dir, name, content);
  };

  it('keeps .next and installs no rimraf', () => {
    next({ dev: 'next dev', build: 'next build' });

    const actions = plan(detect(dir), answers());
    expect(() => on(actions, 'package.json')).toThrow(
      'nothing planned for package.json',
    );
    const packages = actions.flatMap((action) =>
      action.kind === 'install' ? action.packages : [],
    );
    expect(packages).not.toContain('rimraf');
  });

  it('leaves the scripts of another bundler alone', () => {
    add(
      dir,
      'package.json',
      `${JSON.stringify({ name: 'app', scripts: { build: 'vite build' }, devDependencies: { vite: '^8.0.13' } }, null, 2)}\n`,
    );
    add(dir, 'tsconfig.json', '{}');

    expect(() => on(plan(detect(dir), answers()), 'package.json')).toThrow(
      'nothing planned for package.json',
    );
  });
});

describe('an import the config only mentions', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-mention-')),
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const vite = (config: string) => {
    add(
      dir,
      'package.json',
      `${JSON.stringify({ name: 'app', devDependencies: { vite: '^8.0.13' } }, null, 2)}\n`,
    );
    add(dir, 'tsconfig.json', '{}');
    add(dir, 'vite.config.ts', config);
  };

  it('registers the plugin when only a property of it is read', () => {
    vite(`import typedcss from '@typedcss/unplugin';

console.log(typedcss.version);

export default defineConfig({
  plugins: [react()],
});
`);

    const action = on(plan(detect(dir), answers()), 'vite.config.ts');
    expect(action.kind).toBe('patch');
    expect(contentsOf(action)).toContain('typedcss.vite()');
  });

  it('registers the plugin when the call is only in a comment', () => {
    vite(`import typedcss from '@typedcss/unplugin';

export default defineConfig({
  // plugins: [typedcss.vite()],
  plugins: [react()],
});
`);

    expect(on(plan(detect(dir), answers()), 'vite.config.ts').kind).toBe(
      'patch',
    );
  });

  it('wraps a Next config whose withTypedCSS import spans lines', () => {
    add(
      dir,
      'package.json',
      `${JSON.stringify({ name: 'app', scripts: { build: 'next build' }, dependencies: { next: '^16.3.1' } }, null, 2)}\n`,
    );
    add(dir, 'tsconfig.json', '{}');
    add(
      dir,
      'next.config.ts',
      `import {
  withTypedCSS,
} from '@typedcss/next-plugin';

const nextConfig = {};

export default nextConfig;
`,
    );

    const patched = contentsOf(
      on(plan(detect(dir), answers()), 'next.config.ts'),
    );
    expect(patched).toContain('export default withTypedCSS(nextConfig);');
    expect(patched.match(/@typedcss\/next-plugin/g)).toHaveLength(1);
  });
});
