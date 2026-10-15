import { requestWidgetUpdate } from 'react-native-android-widget';
import { saveSnapshot, WIDGET_NAMES, type WidgetSnapshot } from './snapshot';
import { widgetFor } from './WidgetViews';

/** Saves the snapshot and redraws every widget on the home screen with it. */
export async function updateWidgets(snapshot: WidgetSnapshot | null) {
  await saveSnapshot(snapshot);
  for (const name of WIDGET_NAMES) {
    try {
      await requestWidgetUpdate({
        widgetName: name,
        renderWidget: () => widgetFor(name, snapshot),
      });
    } catch {
      // A widget that cannot be drawn keeps its last picture.
    }
  }
}
