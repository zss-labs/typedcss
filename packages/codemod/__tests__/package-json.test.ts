import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  installCommand,
  migrateManifest,
  migrateManifests,
} from '../src/package-json';
import { toPlumeria } from '../src/transforms/migrate-to-plumeria';

// any range is carried over as is
const range = 'workspace:*';

describe('migrateManifest', () => {
  it('swaps each package and keeps its range and position', () => {
    const manifest = {
      dependencies: { '@typedcss/css': range, react: '^19.0.0' },
      devDependencies: {
        '@typedcss/eslint-plugin': range,
        '@typedcss/unplugin': range,
        '@typedcss/oxide': range,
      },
    };
    expect(migrateManifest(manifest, toPlumeria)).toHaveLength(3);
    expect(manifest).toEqual({
      dependencies: { '@plumeria/core': range, react: '^19.0.0' },
      devDependencies: {
        '@plumeria/eslint-plugin': range,
        '@plumeria/unplugin': range,
        '@typedcss/oxide': range,
      },
    });
    expect(Object.keys(manifest.dependencies)).toEqual([
      '@plumeria/core',
      'react',
    ]);
  });

  it('moves the runtime into dependencies', () => {
    const manifest: Record<string, Record<string, string>> = {
      dependencies: { react: '^19.0.0' },
      devDependencies: {
        '@typedcss/css': range,
        '@typedcss/next-plugin': range,
      },
    };
    migrateManifest(manifest, toPlumeria);
    expect(manifest).toEqual({
      dependencies: { '@plumeria/core': range, react: '^19.0.0' },
      devDependencies: { '@plumeria/next-plugin': range },
    });
  });

  it('drops a section the move leaves empty', () => {
    const manifest: Record<string, Record<string, string>> = {
      devDependencies: { '@typedcss/css': range },
    };
    migrateManifest(manifest, toPlumeria);
    expect(manifest).toEqual({
      dependencies: { '@plumeria/core': range },
    });
  });

  it('leaves a manifest without typedcss alone', () => {
    const manifest = { dependencies: { react: '^19.0.0' } };
    expect(migrateManifest(manifest, toPlumeria)).toEqual([]);
    expect(manifest).toEqual({ dependencies: { react: '^19.0.0' } });
  });

  it('keeps an existing target and runtime dependency', () => {
    const manifest = {
      dependencies: { '@plumeria/core': '^1.0.0' },
      optionalDependencies: {
        '@plumeria/unplugin': '^1.0.0',
        '@typedcss/css': range,
        '@typedcss/unplugin': range,
      },
    };

    migrateManifest(manifest, toPlumeria);

    expect(manifest).toEqual({
      dependencies: { '@plumeria/core': '^1.0.0' },
      optionalDependencies: {
        '@plumeria/unplugin': '^1.0.0',
      },
    });
  });
});

describe('migrateManifests', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-codemod-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('finds manifests recursively, skips generated directories, and writes them', () => {
    const nested = path.join(directory, 'packages', 'app');
    const skipped = path.join(directory, 'node_modules', 'dependency');
    fs.mkdirSync(nested, { recursive: true });
    fs.mkdirSync(skipped, { recursive: true });
    const manifest = path.join(nested, 'package.json');
    fs.writeFileSync(
      manifest,
      '{\n\t"devDependencies": {\n\t\t"@typedcss/css": "workspace:*"\n\t}\n}\n',
    );
    fs.writeFileSync(
      path.join(skipped, 'package.json'),
      '{"dependencies":{"@typedcss/css":"*"}}',
    );
    fs.writeFileSync(path.join(directory, 'invalid.json'), '{');
    const ordinaryFile = path.join(directory, 'notes.txt');
    fs.writeFileSync(ordinaryFile, 'notes');

    const changes = migrateManifests(
      [directory, manifest, ordinaryFile, path.join(directory, 'missing')],
      toPlumeria,
      false,
    );

    expect(changes).toEqual([
      {
        file: manifest,
        moved: ['@typedcss/css → @plumeria/core'],
      },
    ]);
    expect(fs.readFileSync(manifest, 'utf8')).toBe(
      '{\n\t"dependencies": {\n\t\t"@plumeria/core": "workspace:*"\n\t}\n}\n',
    );
  });

  it('ignores invalid and unchanged manifests and supports dry runs', () => {
    const invalid = path.join(directory, 'package.json');
    const unchangedDirectory = path.join(directory, 'unchanged');
    const changedDirectory = path.join(directory, 'changed');
    fs.mkdirSync(unchangedDirectory);
    fs.mkdirSync(changedDirectory);
    fs.writeFileSync(invalid, '{');
    fs.writeFileSync(
      path.join(unchangedDirectory, 'package.json'),
      '{"dependencies":{"react":"*"}}',
    );
    const changed = path.join(changedDirectory, 'package.json');
    const original = '{"dependencies":{"@typedcss/unplugin":"*"}}';
    fs.writeFileSync(changed, original);

    expect(migrateManifests([directory], toPlumeria, true)).toEqual([
      {
        file: changed,
        moved: ['@typedcss/unplugin → @plumeria/unplugin'],
      },
    ]);
    expect(fs.readFileSync(changed, 'utf8')).toBe(original);

    expect(migrateManifests([changed], toPlumeria, false)).toHaveLength(1);
    expect(fs.readFileSync(changed, 'utf8')).toBe(
      '{\n  "dependencies": {\n    "@plumeria/unplugin": "*"\n  }\n}',
    );
  });
});

describe('installCommand', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-install-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('uses packageManager from the nearest ancestor manifest', () => {
    const nested = path.join(directory, 'packages', 'app');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({ packageManager: 'pnpm@11.0.0' }),
    );

    expect(installCommand(nested)).toBe('pnpm install');
  });

  it.each([
    ['pnpm-lock.yaml', 'pnpm install'],
    ['yarn.lock', 'yarn install'],
    ['bun.lock', 'bun install'],
    ['bun.lockb', 'bun install'],
    ['package-lock.json', 'npm install'],
  ])('uses %s when no package manager is declared', (lockfile, command) => {
    fs.writeFileSync(path.join(directory, 'package.json'), '{}');
    fs.writeFileSync(path.join(directory, lockfile), '');

    expect(installCommand(directory)).toBe(command);
  });

  it('falls back to npm when no manifest or lockfile exists', () => {
    expect(installCommand(directory)).toBe('npm install');
  });
});
