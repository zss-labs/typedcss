import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';
import typedcss from '@typedcss/unplugin';

export default defineConfig({
  plugins: [solid(), typedcss.vite()],
});
