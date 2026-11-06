import { migrateManifest } from '../src/package-json';
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
});
