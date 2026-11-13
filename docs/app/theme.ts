import * as css from '@typedcss/css';

export const theme = css.createTheme('.dark', {
  bg: { default: '#ffffff', theme: '#000000' },
  fg: { default: '#0b1211', theme: '#edf2f1' },
  muted: { default: '#47524f', theme: '#94a3a1' },
  faint: { default: '#9aa6a4', theme: '#56635f' },
  line: { default: '#d3dbd9', theme: '#2a3534' },
  panel: { default: '#f5f8f7', theme: '#0f1514' },
  hover: { default: '#e6eeec', theme: '#263330' },
  accent: { default: '#0d9488', theme: '#2dd4bf' },
  accentText: { default: '#0f766e', theme: '#2dd4bf' },
  accentSoft: {
    default: 'rgba(13, 148, 136, 0.12)',
    theme: 'rgba(45, 212, 191, 0.14)',
  },
});
