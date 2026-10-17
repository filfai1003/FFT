/**
 * Web and iOS: there are no home screen widgets (the Android version is update.android.ts).
 */
import type { WidgetSnapshot } from './snapshot';
import type { WidgetState } from './state';

export async function updateWidgets(_snapshot: WidgetSnapshot | null, _state?: WidgetState) {}
