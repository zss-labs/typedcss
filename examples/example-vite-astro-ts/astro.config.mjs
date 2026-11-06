/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import typedcss from '@typedcss/unplugin';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [typedcss.vite()],
  },
  integrations: [react()],
});
