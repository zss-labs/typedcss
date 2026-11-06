/**
 * Bundler plugin required.
 * ```ts
 * type create = <const T extends Record<string, CreateStyleValue>>(rule: T)=> CreateReturnType<T>;
 * type props = <const T extends Style>(...styles: T[])=> {
 *   className?: string;
 *   style?: Record<string, string | number>;
 * };
 * type createTheme = <const T extends CreateTheme>(themeSelector: CreateThemeSelector, rule: T) => CreateThemeReturnType<T>;
 * type createStatic = <const T extends CreateStatic>(rule: T)=> T;
 * type keyframes = <const T extends Keyframes>(rule: T) => string;
 * type viewTransitionClass = <const T extends ViewTransition>(rule: T) => string;
 * type positionTry = <const T extends PositionTry>(rule: T) => CSSVariableKey;
 * type varType = <const T extends VarType>(rule: T) => CSSVariableKey;
 * type marker = (id: string, pseudo: string) => Marker;
 * type extended = <I extends string, P extends string>(id: I, pseudo: P) => Extended<I, P>;
 * ```
 */
declare module '@typedcss/css' {
  import type {
    AtomicClassNameFor,
    AtomicClassStyleFor,
    AtomicStyle,
    AtomicClassStyle,
    Style,
    StyleProps,
    StaticStyles,
    WithoutProperties,
    CSSProperties,
    CreateStyleValue,
    CreateReturnType,
    CreateTheme,
    CreateThemeSelector,
    CreateThemeReturnType,
    CreateStatic,
    Keyframes,
    ViewTransition,
    PositionTry,
    VarType,
    CSSVariableKey,
    Marker,
    Extended,
  } from '#types';

  export type {
    AtomicClassNameFor,
    AtomicClassStyleFor,
    AtomicStyle,
    AtomicClassStyle,
    Style,
    StyleProps,
    StaticStyles,
    WithoutProperties,
    CSSProperties,
  };

  /**
   * Merges styles into `className` and `style`; the last style wins per property.
   * ```tsx
   * <div {...css.props(styles.link, active && styles.active)} />
   * ```
   */

  export function props(...styles: Style[]): {
    className?: string;
    style?: Record<string, string | number>;
  };

  export const create: create;
  export type create = <const T extends Record<string, CreateStyleValue>>(
    rule: T,
  ) => CreateReturnType<T>;

  export const createTheme: createTheme;
  export type createTheme = <const T extends CreateTheme>(
    themeSelector: CreateThemeSelector,
    rule: T,
  ) => CreateThemeReturnType<T>;

  export const createStatic: createStatic;
  export type createStatic = <const T extends CreateStatic>(rule: T) => T;

  export const keyframes: keyframes;
  export type keyframes = <const T extends Keyframes>(rule: T) => string;

  export const viewTransitionClass: viewTransitionClass;
  export type viewTransitionClass = <const T extends ViewTransition>(
    rule: T,
  ) => string;

  export const positionTry: positionTry;
  export type positionTry = <const T extends PositionTry>(
    rule: T,
  ) => CSSVariableKey;

  export const varType: varType;
  export type varType = <const T extends VarType>(rule: T) => CSSVariableKey;

  export const marker: marker;
  export type marker = (id: string, pseudo: string) => Marker;

  export const extended: extended;
  export type extended = <I extends string, P extends string>(
    id: I,
    pseudo: P,
  ) => Extended<I, P>;
}
