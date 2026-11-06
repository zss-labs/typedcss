import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import typedcss from '@typedcss/unplugin';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    typedcss.vite(),
    qwikVite({
      csr: true,
    }),
  ],
});
