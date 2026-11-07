import { defineConfig } from '@farmfe/core';
import farmPluginReact from '@farmfe/plugin-react';
import typedcss from '@typedcss/unplugin';

export default defineConfig({
  compilation: {
    // The workspace links @typedcss/css outside node_modules, where Farm
    // would polyfill its runtime with core-js the example does not install.
    presetEnv: { exclude: ['node_modules/', 'packages/css/'] },
  },
  plugins: [
    farmPluginReact(),
    typedcss.farm({
      devEmitToDisk: true,
    }),
  ],
});
