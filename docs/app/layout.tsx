import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './global.css';
import * as css from '@typedcss/css';
import { theme } from './theme';
import { siteUrl } from '@/lib/site';
import { HeaderGate } from './docs/_ui/HeaderGate';
import { SiteHeader } from './docs/_ui/SiteHeader';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const styles = css.create({
  body: {
    color: theme.fg,
    backgroundColor: theme.bg,
  },
});

const initTheme = `try {
  var saved = localStorage.getItem('typedcss-theme');
  document.documentElement.classList.toggle('dark', saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches));
} catch {
  document.documentElement.classList.toggle('dark', matchMedia('(prefers-color-scheme: dark)').matches);
}`;

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: 'TypedCSS — Type-safe atomic CSS-in-JS',
  description:
    'TypedCSS is type-safe atomic CSS-in-JS with build-time compilation and a runtime fallback for dynamic style composition. Works with Next.js, Vite, webpack, and more.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initTheme }} />
      </head>
      <body sx={styles.body}>
        <HeaderGate>
          <SiteHeader />
        </HeaderGate>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
