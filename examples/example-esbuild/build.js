import esbuild from 'esbuild';
import typedcss from '@typedcss/unplugin';

esbuild
  .build({
    entryPoints: ['src/index.tsx'],
    bundle: true,
    outfile: 'dist/bundle.js',
    plugins: [
      typedcss.esbuild({
        include: /\.[jt]sx?$/,
      }),
    ],
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
    },
    format: 'esm',
    minify: false, // Set to false to inspect output
  })
  .catch(() => process.exit(1));
