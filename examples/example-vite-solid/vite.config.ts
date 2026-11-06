import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';
import typedcss from '@typedcss/unplugin';
import type { Plugin } from 'vite';

export default defineConfig({
  plugins: [solid(), typedcss.vite() as Plugin],
});
