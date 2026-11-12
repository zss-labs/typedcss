import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins';

export const { docs, meta } = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: { includeProcessedMarkdown: true },
  },
});

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      themes: {
        light: 'laserwave',
        dark: 'laserwave',
      },
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        {
          pre(node) {
            node.properties['data-language'] = this.options.lang;
          },
        },
      ],
    },
  },
});
