import '@/i18n';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { flushErrors, reportError } from '@/lib/error-report';
import { handleWidgetClick, widgetView } from './controller';
import { WIDGET_NAMES, type WidgetName } from './snapshot';
import { fallbackWidget, widgetFor } from './WidgetViews';

const widgetName = (name: string): WidgetName =>
  (WIDGET_NAMES as readonly string[]).includes(name) ? (name as WidgetName) : 'Calories';

/**
 * Runs in the background when a widget is added, resized, due for its periodic update (every 30
 * minutes: it rebuilds from the database, so a new day starts right with the app closed) or
 * tapped on a quick action (DECISIONS 68). Taps on links open the app without coming here.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetAction === 'WIDGET_DELETED') return;
  try {
    if (props.widgetAction === 'WIDGET_CLICK') {
      await handleWidgetClick(
        props.clickAction,
        props.clickActionData ?? {},
        widgetName(props.widgetInfo.widgetName),
      );
      return;
    }
    const { snapshot, state } = await widgetView();
    props.renderWidget(widgetFor(props.widgetInfo.widgetName, snapshot, state, props.widgetInfo));
  } catch (e) {
    reportError(e, 'widget', { widget: props.widgetInfo.widgetName });
    props.renderWidget(fallbackWidget());
  } finally {
    // The task ends right after: send any report now.
    await flushErrors();
  }
}
