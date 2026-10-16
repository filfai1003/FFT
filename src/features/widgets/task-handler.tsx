import '@/i18n';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { deviceTimeZone, localDay } from '@/domain/day';
import { forToday, readSnapshot } from './snapshot';
import { flushErrors, reportError } from '@/lib/error-report';
import { fallbackWidget, widgetFor } from './WidgetViews';

/**
 * Runs in the background when a widget is added, resized or due for its periodic update (every
 * 30 minutes, so a new day starts from zero even if the app is not opened). Taps are deep links
 * handled by the app, so there is nothing to do on WIDGET_CLICK.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetAction === 'WIDGET_DELETED' || props.widgetAction === 'WIDGET_CLICK') return;
  try {
    const today = localDay(new Date(), deviceTimeZone());
    const snapshot = forToday(await readSnapshot(), today);
    props.renderWidget(widgetFor(props.widgetInfo.widgetName, snapshot));
  } catch (e) {
    reportError(e, 'widget', { widget: props.widgetInfo.widgetName });
    props.renderWidget(fallbackWidget());
    // The task ends right after: send the report now.
    await flushErrors();
  }
}
