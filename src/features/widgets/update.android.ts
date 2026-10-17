import { requestWidgetUpdate } from 'react-native-android-widget';
import { reportError } from '@/lib/error-report';
import { saveSnapshot, WIDGET_NAMES, type WidgetSnapshot } from './snapshot';
import { liveState, readState, type WidgetState } from './state';
import { widgetFor } from './WidgetViews';

/** Saves the snapshot and redraws every widget on the home screen with it (and the widgets' state). */
export async function updateWidgets(snapshot: WidgetSnapshot | null, state?: WidgetState) {
  await saveSnapshot(snapshot);
  const live = liveState(state ?? (await readState()), Date.now());
  for (const name of WIDGET_NAMES) {
    try {
      await requestWidgetUpdate({
        widgetName: name,
        renderWidget: (info) => widgetFor(name, snapshot, live, info),
      });
    } catch (e) {
      // A widget that cannot be drawn keeps its last picture; the error goes to the admin panel.
      reportError(e, 'widget', { widget: name });
    }
  }
}
