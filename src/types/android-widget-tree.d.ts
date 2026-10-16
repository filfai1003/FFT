// The widget library's internal tree builder (what Android receives), used by the widget tests.
declare module 'react-native-android-widget/lib/commonjs/api/build-widget-tree' {
  import type { JSX } from 'react';

  export function buildWidgetTree(jsxTree: JSX.Element): unknown;
}
