import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import typedcss from '@typedcss/unplugin';

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact(), typedcss.vite()],
});
