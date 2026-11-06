import { defineConfig } from '@farmfe/core';
import farmPluginReact from '@farmfe/plugin-react';
import typedcss from '@typedcss/unplugin';

export default defineConfig({
  plugins: [
    farmPluginReact(),
    typedcss.farm({
      devEmitToDisk: true,
    }),
  ],
});
