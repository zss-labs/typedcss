import 'preact';
import type { Style } from '@typedcss/css';

declare module 'preact' {
  namespace JSX {
    interface HTMLAttributes {
      sx?: Style;
    }
    interface SVGAttributes {
      sx?: Style;
    }
  }
}
