import { ImageResponse } from 'next/og';

export const alt = 'TypedCSS';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const Mark = ({ size, opacity = 1 }: { size: number; opacity?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    width={size}
    height={size}
    style={{ opacity }}
  >
    <path d="M41.53 51.25L32 56.75V34.75L41.53 29.25Z" fill="#115e59" />
    <path d="M22.47 51.25L32 56.75V34.75L22.47 29.25Z" fill="#0d9488" />
    <path d="M51.05 34.75L41.53 40.25V29.25L51.05 23.75Z" fill="#115e59" />
    <path d="M12.95 23.75L41.53 40.25V29.25L12.95 12.75Z" fill="#0d9488" />
    <path d="M22.47 7.25L51.05 23.75L41.53 29.25L12.95 12.75Z" fill="#2dd4bf" />
  </svg>
);

const Grid = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1200"
    height="630"
    viewBox="0 0 1200 630"
    style={{ position: 'absolute', inset: 0 }}
  >
    {Array.from({ length: 24 }, (_, i) => {
      const x = i * 80 - 400;
      return (
        <g key={i} stroke="#2dd4bf" strokeOpacity="0.07" strokeWidth="1">
          <line x1={x} y1="0" x2={x + 1091} y2="630" />
          <line x1={x + 1091} y1="0" x2={x} y2="630" />
        </g>
      );
    })}
  </svg>
);

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: '0 96px',
        color: '#edf2f1',
        backgroundColor: '#090c0c',
        backgroundImage:
          'radial-gradient(circle 520px at 78% 50%, rgba(45, 212, 191, 0.2), rgba(45, 212, 191, 0))',
      }}
    >
      <Grid />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
          maxWidth: 620,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Mark size={64} />
          <div
            style={{ fontSize: 72, fontWeight: 700, letterSpacing: '-0.04em' }}
          >
            TypedCSS
          </div>
        </div>
        <div style={{ fontSize: 34, lineHeight: 1.35, color: '#94a3a1' }}>
          The atomic CSS-in-JS dual model of Plumeria. The same API, merged at
          runtime.
        </div>
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            padding: '12px 22px',
            fontSize: 26,
            color: '#2dd4bf',
            background: 'rgba(45, 212, 191, 0.1)',
            border: '1px solid rgba(45, 212, 191, 0.3)',
            borderRadius: 9999,
          }}
        >
          npx @typedcss/init
        </div>
      </div>
      <Mark size={360} />
    </div>,
    size,
  );
}
