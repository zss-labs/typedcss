import react from '@vitejs/plugin-react';
import typedcss from '@typedcss/unplugin';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    plugins: [react(), typedcss.vite()],
  },
});
