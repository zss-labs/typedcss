import * as css from '@typedcss/css';

export const docs = css.createTheme('.dark', {
  docBg: { default: '#ffffff', theme: '#000000' },
  docFg: { default: '#0a0a0a', theme: '#ebebeb' },
  docStrong: { default: '#000000', theme: '#ffffff' },
  docMuted: { default: '#737373', theme: '#b3b3b3cc' },
  docProse: { default: '#454144', theme: '#8f8f8fcc' },
  docLabel: { default: '#808080', theme: '#807d82' },
  docBorder: { default: '#cccccc80', theme: '#6663' },
  docAccent: { default: '#d1d1d180', theme: '#6868684d' },
  docCode: { default: '#f5f5f5', theme: '#212121' },
  docPrimary: { default: '#0d9488', theme: '#2dd4bf' },
  docPrimarySoft: {
    default: 'rgba(13, 148, 136, 0.1)',
    theme: 'rgba(45, 212, 191, 0.1)',
  },
});

export const bp = css.createStatic({
  md: '@media (max-width: 768px)',
  lg: '@media (max-width: 1279.98px)',
  mdUp: '@media (min-width: 768.02px)',
});
