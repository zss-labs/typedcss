import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import { createMDX } from 'fumadocs-mdx/next';
import { withTypedCSS } from '@typedcss/next-plugin';

const withMDX = createMDX();

const config: NextConfig = {
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  agentRules: false,
};

export default (phase: string) =>
  withMDX(
    withTypedCSS(
      {
        ...config,
        ...(phase !== PHASE_DEVELOPMENT_SERVER
          ? { output: 'export' as const }
          : {
              headers: async () => [
                {
                  source: '/:path(playground|playground/.*|_next/.*)',
                  headers: [
                    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
                    {
                      key: 'Cross-Origin-Embedder-Policy',
                      value: 'require-corp',
                    },
                  ],
                },
              ],
            }),
      },
      {
        exclude: [
          '**/node_modules/**',
          '**/.next/**',
          '**/dist/**',
          '**/build/**',
          '**/.git/**',
          '**/public/**',
        ],
      },
    ),
  );
