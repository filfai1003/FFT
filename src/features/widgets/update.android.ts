import { requestWidgetUpdate } from 'react-native-android-widget';
import { saveSnapshot, WIDGET_NAMES, type WidgetSnapshot } from './snapshot';
import { reportError } from '@/lib/error-report';
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
    } catch (e) {
      // A widget that cannot be drawn keeps its last picture; the error goes to the admin panel.
      reportError(e, 'widget', { widget: name });
    }
  }
}
