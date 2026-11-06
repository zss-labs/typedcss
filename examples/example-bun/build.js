import typedcss from '@typedcss/unplugin';

await Bun.build({
  entrypoints: ['./src/index.tsx'],
  outdir: './dist',
  plugins: [typedcss.bun()],
});
