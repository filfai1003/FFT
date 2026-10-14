// On the web the browser keeps the focused field visible: plain components, same props.
import type { ReactNode } from 'react';
import { ScrollView, View, type ScrollViewProps, type ViewProps } from 'react-native';

export function KeyboardProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function KeyboardAwareScrollView({
  bottomOffset: _bottomOffset,
  enabled: _enabled,
  ...props
}: ScrollViewProps & { bottomOffset?: number; enabled?: boolean }) {
  return <ScrollView {...props} />;
}

export function KeyboardAvoidingView({
  behavior: _behavior,
  ...props
}: ViewProps & { behavior?: 'padding' | 'height' | 'position' }) {
  return <View {...props} />;
}

export function KeyboardStickyView({
  offset: _offset,
  ...props
}: ViewProps & { offset?: { closed?: number; opened?: number } }) {
  return <View {...props} />;
}
