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
  title: 'TypedCSS — Predictable overrides across component boundaries',
  description:
    'TypedCSS brings predictable overrides to React styling across component boundaries. The rightmost style in an array wins for each property, regardless of import or load order.',
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
