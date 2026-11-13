import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { source } from '@/lib/source';

export const dynamic = 'force-static';

const card = `data:image/png;base64,${(
  await readFile(join(process.cwd(), 'app/opengraph-image.png'))
).toString('base64')}`;

export function generateStaticParams() {
  return source.getPages().map((page) => ({ slug: [...page.slugs, 'og.png'] }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) return new Response('Not Found', { status: 404 });
  const title = page.data.title.slice(0, 100);

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '200px',
        fontSize: 30,
        fontWeight: 700,
        color: '#fff',
        textAlign: 'center',
        backgroundImage: `url(${card})`,
        backgroundSize: '1200px 630px',
      }}
    >
      {title}
    </div>,
  );
}
