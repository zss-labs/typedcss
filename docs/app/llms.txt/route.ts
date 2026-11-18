import { llms } from 'fumadocs-core/source/llms';
import { source } from '@/lib/source';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-static';

export async function GET() {
  const index = await llms(source, {
    renderUrl: (node) => new URL(node.url, siteUrl).href,
  }).index();

  const body = index.replace(
    /^# .*\n+/,
    '# TypedCSS\n\n> Type-safe atomic CSS-in-JS. Styles compile at build time. What the build can’t settle merges on the element.\n\n',
  );

  return new Response(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
