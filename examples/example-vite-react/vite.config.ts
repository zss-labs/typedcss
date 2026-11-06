import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import typedcss from '@typedcss/unplugin';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), typedcss.vite()],
});
