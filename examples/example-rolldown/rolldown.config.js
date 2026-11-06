import { defineConfig } from 'rolldown';
import typedcss from '@typedcss/unplugin';
import postcss from 'rollup-plugin-postcss';

export default defineConfig({
  input: 'src/index.tsx',
  output: {
    dir: 'dist',
  },
  moduleTypes: {
    css: 'empty',
  },
  plugins: [typedcss.rolldown(), postcss({ extract: true })],
});
